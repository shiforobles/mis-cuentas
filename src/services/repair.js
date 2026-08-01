/**
 * MIS CUENTAS — Reparación de integridad de datos
 *
 * Problema que resuelve: el sync entre dispositivos resuelve conflictos por
 * last-write-wins A NIVEL DE REGISTRO. El registro de un mes contiene los
 * campos `real` de todos sus ítems, así que un dispositivo con una copia
 * desactualizada del mes puede "ganar" y pisar los reales que otro dispositivo
 * había acumulado con transacciones (los reales quedan en 0 o en un valor
 * viejo, o directamente desaparecen ítems y sus transacciones quedan
 * huérfanas). Las TRANSACCIONES son registros individuales y sobreviven
 * siempre: son la fuente de verdad de lo "real".
 *
 * Este módulo recalcula `item.real` = suma de sus transacciones y re-adopta
 * las transacciones huérfanas en un ítem "♻️ Recuperados" de su categoría.
 * Es idempotente: si no hay nada que corregir, no escribe nada (y por lo
 * tanto no re-dispara sync).
 */

import { dbGetAll, dbPut, dbDelete } from '../db/database.js';

const RECOVERY_LABEL = '♻️ Recuperados';

/** Id determinístico para el ítem de recuperación: igual en todos los
 *  dispositivos, así dos reparaciones concurrentes convergen al mismo ítem. */
function recoveryItemId(mesId, type, categoryId) {
  return `recuperado-${mesId}-${type}${categoryId != null ? `-${categoryId}` : ''}`;
}

/**
 * Recalcula los `real` de todos los meses a partir de las transacciones y
 * re-adopta transacciones huérfanas.
 *
 * Reglas:
 *  - Ítem CON transacciones → real = suma exacta de sus transacciones.
 *  - Ítem SIN transacciones → no se toca (preserva los históricos importados
 *    de Excel, que tienen `real` cargado a mano y cero transacciones).
 *  - Transacción cuyo ítem ya no existe → se re-asigna a un ítem
 *    "♻️ Recuperados" de su misma categoría (se crea si hace falta).
 *
 * @returns {Promise<{itemsCorregidos:number, mesesEscritos:number, huerfanasAdoptadas:number}>}
 */
export async function repairRealsFromTransactions() {
  const [months, txs] = await Promise.all([
    dbGetAll('months'),
    dbGetAll('transactions'),
  ]);

  // Índices: transacciones por ítem, y todos los ítems existentes por id.
  const txByItem = new Map();
  for (const t of txs) {
    if (!t?.itemId) continue;
    if (!txByItem.has(t.itemId)) txByItem.set(t.itemId, []);
    txByItem.get(t.itemId).push(t);
  }

  const monthById = new Map(months.filter(m => m?.id).map(m => [m.id, m]));
  const knownItemIds = new Set();
  for (const m of monthById.values()) {
    for (const it of m.ingresos || []) knownItemIds.add(it.id);
    for (const cat of Object.values(m.egresos || {})) {
      for (const it of cat.items || []) knownItemIds.add(it.id);
    }
  }

  const dirtyMonths = new Set();
  let itemsCorregidos = 0;
  let huerfanasAdoptadas = 0;

  // 1) Re-adoptar huérfanas: agrupar por (mes, tipo, categoría) y reasignarlas
  //    a un ítem de recuperación con id determinístico.
  const orphans = txs.filter(t => t?.itemId && !knownItemIds.has(t.itemId) && monthById.has(t.mesId));
  const orphanGroups = new Map();
  for (const t of orphans) {
    const key = `${t.mesId}|${t.type}|${t.categoryId ?? ''}`;
    if (!orphanGroups.has(key)) orphanGroups.set(key, []);
    orphanGroups.get(key).push(t);
  }

  for (const group of orphanGroups.values()) {
    const { mesId, type, categoryId } = group[0];
    const month = monthById.get(mesId);
    const recId = recoveryItemId(mesId, type, categoryId);

    let recItem;
    if (type === 'ingreso') {
      month.ingresos = month.ingresos || [];
      recItem = month.ingresos.find(i => i.id === recId);
      if (!recItem) {
        recItem = { id: recId, descripcion: RECOVERY_LABEL, proyectado: 0, real: 0, horasSemanales: '', horasMensuales: '', horasTotal: '' };
        month.ingresos.push(recItem);
      }
    } else {
      month.egresos = month.egresos || {};
      if (!month.egresos[categoryId]) month.egresos[categoryId] = { items: [] };
      recItem = month.egresos[categoryId].items.find(i => i.id === recId);
      if (!recItem) {
        recItem = { id: recId, descripcion: RECOVERY_LABEL, proyectado: 0, real: 0 };
        month.egresos[categoryId].items.push(recItem);
      }
    }
    knownItemIds.add(recId);

    for (const t of group) {
      t.itemId = recId;
      await dbPut('transactions', t); // se re-sincroniza con el nuevo destino
      if (!txByItem.has(recId)) txByItem.set(recId, []);
      txByItem.get(recId).push(t);
      huerfanasAdoptadas++;
    }
    dirtyMonths.add(mesId);
  }

  // 2) Recalcular real = suma de transacciones (solo ítems que tienen alguna).
  for (const m of monthById.values()) {
    const fixItem = (item) => {
      const its = txByItem.get(item.id);
      if (!its || its.length === 0) return; // sin txs: no tocar (histórico Excel)
      const total = its.reduce((s, t) => s + (Number(t.amount) || 0), 0);
      if (Math.abs((Number(item.real) || 0) - total) > 0.005) {
        item.real = total;
        itemsCorregidos++;
        dirtyMonths.add(m.id);
      }
    };
    for (const it of m.ingresos || []) fixItem(it);
    for (const cat of Object.values(m.egresos || {})) {
      for (const it of cat.items || []) fixItem(it);
    }
  }

  // 3) Persistir solo los meses modificados.
  for (const mesId of dirtyMonths) {
    await dbPut('months', monthById.get(mesId));
  }

  // 4) Limpieza: recurrentes accidentales sin descripción (generan filas
  //    vacías en cada mes nuevo que se siembra).
  try {
    const recurring = await dbGetAll('recurring');
    for (const r of recurring) {
      if (r && !String(r.descripcion || '').trim() && !(r.proyectado > 0)) {
        await dbDelete('recurring', r.id);
      }
    }
  } catch { /* no crítico */ }

  const summary = { itemsCorregidos, mesesEscritos: dirtyMonths.size, huerfanasAdoptadas };
  if (itemsCorregidos || huerfanasAdoptadas) {
    console.log(`[repair] Reales recalculados: ${itemsCorregidos} ítem(s) corregidos, ${huerfanasAdoptadas} transacción(es) huérfana(s) adoptadas, ${dirtyMonths.size} mes(es) actualizados.`);
  }
  return summary;
}
