import { dbGet, dbPut, dbDelete, dbGetTransactionsByMonth, dbGetTransactionsByItem } from '../db/database.js';
import { getDolarCCL } from './dollar.js';
import { generateId } from '../utils/helpers.js';

/**
 * Aplica un delta sobre el monto de una línea de la cartera, EN LA MONEDA DE
 * ESA LÍNEA (el delta ya viene convertido: ver buildCarteraLink). No crea
 * campos paralelos: mueve el único número `monto` que el usuario también edita
 * a mano en Config. Clampea a 0 para evitar negativos si el usuario bajó el
 * monto manualmente por debajo del aporte.
 *
 * @param {{section: string, key: string}} link - Destino en la cartera
 * @param {number} delta - Monto a sumar (positivo) o revertir (negativo)
 */
async function applyCarteraDelta(link, delta) {
  if (!link || !link.section || !link.key || !delta) return;
  const portfolio = await dbGet('portfolio', 'current');
  if (!portfolio) return;
  const item = portfolio[link.section]?.[link.key];
  if (!item) return; // La línea fue eliminada en Config: no hay dónde aplicar.
  item.monto = Math.max(0, (Number(item.monto) || 0) + delta);
  await dbPut('portfolio', portfolio);
}

/**
 * Construye el vínculo de cartera normalizado a partir del destino elegido y el
 * monto (en ARS) de la transacción. Si la línea destino está en USD, convierte
 * el aporte ARS→USD con el CCL del mes. El `amount` resultante queda en la
 * moneda de la línea (es el delta exacto que se sumará/revertirá).
 *
 * @param {{section: string, key: string}|null} link - destino elegido
 * @param {number} amountARS - monto de la transacción, en ARS
 * @param {string} mesId - mes de la transacción (para tomar el CCL correcto)
 * @returns {Promise<{section,key,amount,moneda,ccl}|null>}
 */
async function buildCarteraLink(link, amountARS, mesId) {
  if (!link || !link.section || !link.key) return null;

  const portfolio = await dbGet('portfolio', 'current');
  const line = portfolio?.[link.section]?.[link.key];
  const moneda = line?.moneda || 'ARS';

  let amount = amountARS; // por defecto la línea es ARS → mismo monto
  let ccl = null;
  if (moneda === 'USD') {
    ccl = await getDolarCCL(mesId);
    amount = ccl > 0 ? amountARS / ccl : 0; // ARS → USD
  }

  return { section: link.section, key: link.key, amount, moneda, ccl };
}

/**
 * Guarda una transacción y actualiza el total "Real" del ítem del mes.
 * Si la transacción trae `carteraLink`, sincroniza la línea de cartera por deltas:
 *  - Nueva: suma el monto a la línea destino.
 *  - Editada: revierte el aporte anterior y aplica el nuevo (maneja también el
 *    cambio de destino y el cambio de monto en una sola operación neta).
 *
 * @param {Object} txData - Datos de la transacción (monto, carteraLink, etc.)
 */
export async function saveTransaction(txData) {
  // Leer el estado previo para calcular el delta de cartera en ediciones.
  const prevTx = txData.id ? await dbGet('transactions', txData.id) : null;

  // Normalizar el vínculo de cartera nuevo. La transacción está en ARS; si la
  // línea destino está en USD, convertimos el aporte a USD con el CCL del mes
  // (así no sumamos pesos a una línea en dólares). El monto guardado queda en
  // la moneda de la línea, que es lo que se suma/revierte como delta.
  const amount = Number(txData.amount) || 0;
  const carteraLink = await buildCarteraLink(txData.carteraLink, amount, txData.mesId);

  const tx = {
    id: txData.id || generateId(),
    mesId: txData.mesId,
    type: txData.type, // 'ingreso' | 'egreso'
    categoryId: txData.categoryId || null,
    itemId: txData.itemId,
    amount,
    date: txData.date || new Date().toISOString(),
    // Timestamp de carga (orden de creación). Se setea una sola vez al crear y
    // se preserva en ediciones — a diferencia de `date`, que es la fecha del
    // movimiento y podría volverse editable. Lo usa la vista Buscar para
    // ordenar "lo último cargado arriba".
    createdAt: prevTx?.createdAt || txData.createdAt || new Date().toISOString(),
    note: txData.note || '',
    carteraLink,
  };

  await dbPut('transactions', tx);

  // Sincronizar cartera: revertir aporte anterior, aplicar el nuevo.
  // Hacerlo así (full revert + full apply) cubre cambio de monto Y de destino.
  if (prevTx?.carteraLink) {
    await applyCarteraDelta(prevTx.carteraLink, -(Number(prevTx.carteraLink.amount) || 0));
  }
  if (carteraLink) {
    await applyCarteraDelta(carteraLink, carteraLink.amount);
  }

  await recalculateItemReal(tx.mesId, tx.type, tx.categoryId, tx.itemId);

  return tx;
}

/**
 * Elimina una transacción y actualiza el total "Real" del ítem.
 * Si la transacción tenía un vínculo de cartera, revierte el aporte.
 * @param {Object} tx - Transacción a eliminar (requiere id, mesId, type, categoryId, itemId)
 */
export async function deleteTransaction(tx) {
  // Revertir el aporte a cartera (si lo tenía) antes de borrar.
  if (tx.carteraLink) {
    await applyCarteraDelta(tx.carteraLink, -(Number(tx.carteraLink.amount) || 0));
  }
  await dbDelete('transactions', tx.id);
  await recalculateItemReal(tx.mesId, tx.type, tx.categoryId, tx.itemId);
}

/**
 * Recalcula el campo "real" de un ítem sumando todas sus transacciones.
 * @param {string} mesId
 * @param {string} type
 * @param {string} categoryId
 * @param {string} itemId
 */
async function recalculateItemReal(mesId, type, categoryId, itemId) {
  // 1. Obtener todas las transacciones de este ítem
  const txs = await dbGetTransactionsByItem(itemId);
  const totalReal = txs.reduce((sum, t) => sum + t.amount, 0);

  // 2. Obtener el mes
  const monthData = await dbGet('months', mesId);
  if (!monthData) return;

  // 3. Buscar el ítem y actualizar su "real"
  let itemToUpdate = null;

  if (type === 'ingreso') {
    itemToUpdate = monthData.ingresos.find(i => i.id === itemId);
  } else if (type === 'egreso' && categoryId) {
    if (monthData.egresos[categoryId] && monthData.egresos[categoryId].items) {
      itemToUpdate = monthData.egresos[categoryId].items.find(i => i.id === itemId);
    }
  }

  if (itemToUpdate) {
    itemToUpdate.real = totalReal;
    await dbPut('months', monthData);
  }
}

/**
 * Obtiene las transacciones agrupadas u ordenadas si se necesita (opcional)
 */
export async function getTransactionsForItem(itemId) {
  const txs = await dbGetTransactionsByItem(itemId);
  return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
}
