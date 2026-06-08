/**
 * MIS CUENTAS — Base de datos IndexedDB
 * Usa la librería 'idb' como wrapper para una API más limpia con async/await.
 */

import { openDB } from 'idb';
import { CARTERA_DEFAULT } from '../utils/constants.js';
import { deepClone } from '../utils/helpers.js';

const DB_NAME = 'mis-cuentas-db';
// v5: fuerza recrear syncOutbox/syncMeta en bases que quedaron en v4 incompleta
// (la versión había subido pero los stores no se habían creado).
const DB_VERSION = 5;

/**
 * Stores que contienen datos del usuario y se sincronizan con Supabase.
 * (No incluye los stores internos de sync: syncOutbox / syncMeta.)
 */
export const SYNCED_STORES = ['config', 'months', 'portfolio', 'portfolioHistory', 'transactions', 'recurring'];

let dbInstance = null;

/** Todos los stores que la versión actual del esquema debe tener. */
const ALL_STORES = [...SYNCED_STORES, 'syncOutbox', 'syncMeta'];

/** ¿La conexión tiene todos los stores esperados? (detecta conexiones viejas). */
function hasAllStores(db) {
  return ALL_STORES.every(s => db.objectStoreNames.contains(s));
}

/** Crea los object stores que falten. Idempotente; corre en cada upgrade. */
function runUpgrade(db, oldVersion) {
  if (!db.objectStoreNames.contains('config')) {
    db.createObjectStore('config', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('months')) {
    db.createObjectStore('months', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('portfolio')) {
    db.createObjectStore('portfolio', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('portfolioHistory')) {
    db.createObjectStore('portfolioHistory', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('transactions')) {
    const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
    txStore.createIndex('mesId', 'mesId');
    txStore.createIndex('itemId', 'itemId');
  }
  // recurring existe desde v3
  if (!db.objectStoreNames.contains('recurring')) {
    db.createObjectStore('recurring', { keyPath: 'id' });
  }
  // v4: stores internos de sincronización (Supabase).
  // Sin guardas por oldVersion: si por lo que sea faltan (DB que no terminó de
  // migrar), los creamos igual. createObjectStore solo corre dentro de un
  // upgrade, así que es seguro.
  if (!db.objectStoreNames.contains('syncOutbox')) {
    db.createObjectStore('syncOutbox', { keyPath: 'key' });
  }
  if (!db.objectStoreNames.contains('syncMeta')) {
    db.createObjectStore('syncMeta', { keyPath: 'id' });
  }
}

/** Callbacks de apertura (compartidos por todas las aperturas de la DB). */
function dbOpenHandlers() {
  return {
    upgrade(db, oldVersion) {
      runUpgrade(db, oldVersion);
    },
    blocked() {
      // Otra pestaña tiene la DB abierta en una versión vieja y bloquea el upgrade.
      console.warn('[db] Actualización de la base bloqueada por otra pestaña abierta. Cerrá las demás pestañas de Mis Cuentas y recargá.');
    },
    blocking() {
      // Esta conexión bloquea un upgrade de OTRA pestaña: la cerramos para no
      // trabar la actualización. Se reabrirá en el próximo getDB().
      try { dbInstance?.close(); } catch { /* noop */ }
      dbInstance = null;
    },
    terminated() {
      dbInstance = null;
    },
  };
}

/**
 * Abre (o crea) la base de datos IndexedDB. Robusto ante:
 *  - conexión cacheada vieja (sin los stores nuevos) → reabre,
 *  - "versión incompleta": la DB figura en una versión pero le faltan stores
 *    (un upgrade previo subió el número pero no creó todo). Como IndexedDB solo
 *    corre el upgrade cuando la versión AUMENTA, abrir a la misma versión no lo
 *    arregla: detectamos el faltante y reabrimos en versión+1 para forzarlo.
 *  - otra pestaña bloqueando el upgrade → avisamos / cerramos.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export async function getDB() {
  if (dbInstance) {
    if (hasAllStores(dbInstance)) return dbInstance;
    try { dbInstance.close(); } catch { /* noop */ }
    dbInstance = null;
  }

  // Conocer la versión real en disco SIN disparar upgrade, para no abrir nunca
  // por debajo de ella (evitar VersionError) y elegir bien la versión objetivo.
  let onDisk = 0;
  try {
    const probe = await openDB(DB_NAME);
    onDisk = probe.version;
    probe.close();
  } catch { onDisk = 0; }

  // Abrir al menos en DB_VERSION, nunca por debajo de la de disco.
  const target = Math.max(DB_VERSION, onDisk);
  dbInstance = await openDB(DB_NAME, target, dbOpenHandlers());

  // Si quedó incompleta (ya estaba en 'target', así que no se disparó upgrade),
  // forzamos uno reabriendo en la versión siguiente.
  if (!hasAllStores(dbInstance)) {
    const next = dbInstance.version + 1;
    console.warn(`[db] Esquema incompleto en v${dbInstance.version}; reabriendo en v${next} para crear los stores faltantes.`);
    try { dbInstance.close(); } catch { /* noop */ }
    dbInstance = await openDB(DB_NAME, next, dbOpenHandlers());
  }

  return dbInstance;
}

/**
 * Lee un registro de un store.
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<any>}
 */
export async function dbGet(storeName, key) {
  const db = await getDB();
  return db.get(storeName, key);
}

/**
 * Lee todos los registros de un store.
 * @param {string} storeName
 * @returns {Promise<any[]>}
 */
export async function dbGetAll(storeName) {
  const db = await getDB();
  return db.getAll(storeName);
}

/**
 * Escribe (put) un registro en un store. Si el store es sincronizable, estampa
 * `updatedAt` (momento de este cambio local, para el last-write-wins) y encola
 * el registro en el outbox como pendiente de subir. Toda la app escribe por
 * acá, así que el sync queda cubierto sin tocar las vistas.
 * @param {string} storeName
 * @param {any} value
 * @returns {Promise<string>}
 */
export async function dbPut(storeName, value) {
  const db = await getDB();
  if (SYNCED_STORES.includes(storeName) && value && typeof value === 'object') {
    value.updatedAt = new Date().toISOString();
    const res = await db.put(storeName, value);
    await enqueueOutbox(db, storeName, value.id ?? res, 'put', value.updatedAt);
    return res;
  }
  return db.put(storeName, value);
}

/**
 * Escribe SIN estampar `updatedAt` ni encolar en el outbox. La usa el motor de
 * PULL para aplicar lo que baja de la nube sin re-disparar un push (evita loops)
 * y preservando el `updatedAt` remoto.
 * @param {string} storeName
 * @param {any} value
 */
export async function dbPutRaw(storeName, value) {
  const db = await getDB();
  return db.put(storeName, value);
}

/**
 * Elimina un registro de un store. Si es sincronizable, deja un "tombstone" en
 * el outbox para propagar el borrado a la nube y a los otros dispositivos.
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function dbDelete(storeName, key) {
  const db = await getDB();
  const res = await db.delete(storeName, key);
  if (SYNCED_STORES.includes(storeName)) {
    await enqueueOutbox(db, storeName, key, 'delete', new Date().toISOString());
  }
  return res;
}

/**
 * Borra SIN dejar tombstone (lo usa el motor de PULL al aplicar borrados
 * remotos, sin re-encolarlos).
 * @param {string} storeName
 * @param {string} key
 */
export async function dbDeleteRaw(storeName, key) {
  const db = await getDB();
  return db.delete(storeName, key);
}

// ─── OUTBOX (cola de cambios pendientes de sync) ────────────

/**
 * Encola (o actualiza) una entrada del outbox. Key = "store:id" para colapsar
 * múltiples ediciones del mismo registro en una sola entrada (la última gana).
 * Usa el handle de db directo, sin pasar por dbPut (no se sincroniza a sí mismo).
 */
async function enqueueOutbox(db, store, id, op, updatedAt) {
  if (id == null) return;
  try {
    await db.put('syncOutbox', { key: `${store}:${id}`, store, recordId: String(id), op, updatedAt });
    // Avisar al motor de sync que hay un cambio local (auto-sync con debounce).
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mc-sync-dirty'));
    }
  } catch { /* outbox no disponible (DB vieja): ignorar, no romper el guardado */ }
}

/**
 * Devuelve todas las entradas pendientes del outbox.
 * @returns {Promise<Array<{key,store,recordId,op,updatedAt}>>}
 */
export async function getOutbox() {
  const db = await getDB();
  return db.getAll('syncOutbox');
}

/**
 * Quita una entrada del outbox (tras subirla con éxito).
 * @param {string} key - "store:id"
 */
export async function removeFromOutbox(key) {
  const db = await getDB();
  return db.delete('syncOutbox', key);
}

/** Vacía el outbox (descarta los cambios locales pendientes). */
export async function clearOutbox() {
  const db = await getDB();
  return db.clear('syncOutbox');
}

/**
 * Encola TODOS los registros locales de los stores sincronizables como pendientes
 * de subir (push inicial / "subir todo"). NO pisa el `updatedAt` de los que ya lo
 * tienen — solo estampa los que falten — para no romper el last-write-wins.
 */
export async function enqueueAllForInitialPush() {
  const db = await getDB();
  for (const store of SYNCED_STORES) {
    const all = await db.getAll(store);
    for (const rec of all) {
      if (!rec || rec.id == null) continue;
      if (!rec.updatedAt) {
        rec.updatedAt = new Date().toISOString();
        await db.put(store, rec); // put directo: no re-encola por su cuenta
      }
      await enqueueOutbox(db, store, rec.id, 'put', rec.updatedAt);
    }
  }
}

// ─── META DE SYNC (lastPulledAt, etc.) ──────────────────────

/** Lee el registro de metadatos de sync. @returns {Promise<object>} */
export async function getSyncMeta() {
  const db = await getDB();
  return (await db.get('syncMeta', 'state')) || { id: 'state', lastPulledAt: {} };
}

/** Guarda el registro de metadatos de sync. @param {object} meta */
export async function setSyncMeta(meta) {
  const db = await getDB();
  return db.put('syncMeta', { ...meta, id: 'state' });
}

/**
 * Limpia un store completo.
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function dbClear(storeName) {
  const db = await getDB();
  return db.clear(storeName);
}

/**
 * Obtiene todas las transacciones de un mes.
 * @param {string} mesId 
 */
export async function dbGetTransactionsByMonth(mesId) {
  const db = await getDB();
  return db.getAllFromIndex('transactions', 'mesId', mesId);
}

/**
 * Obtiene todas las transacciones de un ítem específico.
 * @param {string} itemId 
 */
export async function dbGetTransactionsByItem(itemId) {
  const db = await getDB();
  return db.getAllFromIndex('transactions', 'itemId', itemId);
}

/**
 * Exporta toda la base de datos como JSON.
 * @returns {Promise<Object>}
 */
export async function exportAllData() {
  const db = await getDB();
  const config = await db.getAll('config');
  const months = await db.getAll('months');
  const portfolio = await db.getAll('portfolio');
  const portfolioHistory = await db.getAll('portfolioHistory');
  const transactions = await db.getAll('transactions');
  const recurring = await db.getAll('recurring');
  
  return {
    version: DB_VERSION,
    exportDate: new Date().toISOString(),
    config,
    months,
    portfolio,
    portfolioHistory,
    transactions,
    recurring,
  };
}

/**
 * Importa datos JSON a la base de datos (reemplaza todo). Valida la FORMA de
 * cada registro contra su store: descarta (no importa) los que tengan estructura
 * inválida, para que un backup viejo/ajeno no corrompa los datos (p.ej. filas con
 * forma de config metidas en months). Devuelve un resumen de lo importado/saltado.
 * @param {Object} data
 * @returns {Promise<{imported:number, skipped:number, skippedDetail:Array}>}
 */
export async function importAllData(data) {
  const { validateForStore } = await import('../utils/sync-validate.js');
  const db = await getDB();

  const storeNames = ['config', 'months', 'portfolio', 'portfolioHistory', 'transactions', 'recurring'];
  const tx = db.transaction(storeNames, 'readwrite');

  // Limpiar stores
  for (const name of storeNames) {
    await tx.objectStore(name).clear();
  }

  let imported = 0, skipped = 0;
  const skippedDetail = [];

  // Importar datos (validando cada registro)
  for (const name of storeNames) {
    if (!Array.isArray(data[name])) continue;
    for (const item of data[name]) {
      const v = validateForStore(name, item, item?.id);
      if (!v.ok) {
        skipped++;
        skippedDetail.push({ store: name, id: item?.id, reason: v.reason });
        console.error(`[import] Registro descartado (${name}:${item?.id}): ${v.reason}`, item);
        continue;
      }
      await tx.objectStore(name).put(item);
      imported++;
    }
  }

  await tx.done;

  if (skipped > 0) {
    console.warn(`[import] ${skipped} registro(s) con forma inválida fueron descartados.`, skippedDetail);
  }
  return { imported, skipped, skippedDetail };
}

/**
 * Resetea los datos cargados por el usuario dejando 2026 "en cero", pero
 * conservando la configuración (categorías, % ideales, año, tema), los ítems
 * plantilla y los gastos recurrentes.
 *
 * - Borra: months, transactions, portfolioHistory.
 * - Resetea: portfolio → cartera vacía (todo en cero).
 * - Limpia del config SOLO lo relacionado al dólar (historico, capturas,
 *   override manual global y por mes).
 * - Re-siembra los 12 meses con la plantilla (proyectado del template, real: 0).
 *
 * @returns {Promise<void>}
 */
export async function resetUserData() {
  const db = await getDB();

  // 1. Borrar stores de datos cargados
  await db.clear('months');
  await db.clear('transactions');
  await db.clear('portfolioHistory');

  // 2. Resetear cartera a cero
  await db.put('portfolio', deepClone(CARTERA_DEFAULT));

  // 3. Limpiar SOLO los datos de dólar del config (conservar todo lo demás)
  const config = await db.get('config', 'global');
  if (config) {
    config.dolarHistorico = {};
    config.dolarCapturas = {};
    config.dolarManualPorMes = {};
    config.dolarCCLManual = null;
    await db.put('config', config);
  }

  // 4. Re-sembrar los 12 meses limpios con la plantilla
  const { seedDatabase } = await import('./seed.js');
  await seedDatabase();
}

// ─── MIGRACIÓN v3: IDs de meses con año ────────────────────

/**
 * Migra los datos de formato v2 (id: "enero") a v3 (id: "enero-2026").
 * Se ejecuta una sola vez. Idempotente.
 */
export async function migrateToV3() {
  const db = await getDB();
  
  // Verificar si ya se migró
  const config = await db.get('config', 'global');
  if (!config) return; // Fresh install, no migration needed
  if (config.dbMigrated >= 3) return; // Already migrated
  
  const año = config.año || 2026;
  console.log(`🔄 Migrando datos a formato v3 (año ${año})...`);
  
  // 1. Migrar months: "enero" → "enero-2026"
  const allMonths = await db.getAll('months');
  for (const month of allMonths) {
    // Skip already migrated (contains -YYYY at end)
    if (month.id.match(/-\d{4}$/)) continue;
    
    const oldId = month.id;
    const newMonth = { ...month, id: `${oldId}-${año}`, año };
    await db.put('months', newMonth);
    await db.delete('months', oldId);
    console.log(`  ✓ ${oldId} → ${newMonth.id}`);
  }
  
  // 2. Migrar transactions: mesId "enero" → "enero-2026"
  const allTx = await db.getAll('transactions');
  for (const tx of allTx) {
    if (tx.mesId && !tx.mesId.match(/-\d{4}$/)) {
      tx.mesId = `${tx.mesId}-${año}`;
      await db.put('transactions', tx);
    }
  }
  
  // 3. Marcar como migrado
  config.dbMigrated = 3;
  await db.put('config', config);
  
  console.log('✓ Migración v3 completada');
}
