import { dbGet, dbPut, dbDelete, dbGetTransactionsByMonth, dbGetTransactionsByItem } from '../db/database.js';
import { generateId } from '../utils/helpers.js';

/**
 * Guarda una transacción y actualiza el total "Real" del ítem correspondiente en el mes.
 * @param {Object} txData - Datos de la transacción (monto, etc.)
 */
export async function saveTransaction(txData) {
  const isNew = !txData.id;
  const tx = {
    id: txData.id || generateId(),
    mesId: txData.mesId,
    type: txData.type, // 'ingreso' | 'egreso'
    categoryId: txData.categoryId || null,
    itemId: txData.itemId,
    amount: Number(txData.amount) || 0,
    date: txData.date || new Date().toISOString(),
    note: txData.note || '',
  };

  await dbPut('transactions', tx);
  await recalculateItemReal(tx.mesId, tx.type, tx.categoryId, tx.itemId);
  
  return tx;
}

/**
 * Elimina una transacción y actualiza el total "Real" del ítem correspondiente.
 * @param {Object} tx - Transacción a eliminar (requiere id, mesId, type, categoryId, itemId)
 */
export async function deleteTransaction(tx) {
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
