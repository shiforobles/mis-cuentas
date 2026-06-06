/**
 * MIS CUENTAS — Base de datos IndexedDB
 * Usa la librería 'idb' como wrapper para una API más limpia con async/await.
 */

import { openDB } from 'idb';
import { CARTERA_DEFAULT } from '../utils/constants.js';
import { deepClone } from '../utils/helpers.js';

const DB_NAME = 'mis-cuentas-db';
const DB_VERSION = 4;

/**
 * Stores que contienen datos del usuario y se sincronizan con Supabase.
 * (No incluye los stores internos de sync: syncOutbox / syncMeta.)
 */
export const SYNCED_STORES = ['config', 'months', 'portfolio', 'portfolioHistory', 'transactions', 'recurring'];

let dbInstance = null;

/**
 * Abre (o crea) la base de datos IndexedDB.
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export async function getDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Store: config — configuración global (1 registro)
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'id' });
      }

      // Store: months — datos mensuales (12 registros, key=nombre del mes)
      if (!db.objectStoreNames.contains('months')) {
        db.createObjectStore('months', { keyPath: 'id' });
      }

      // Store: portfolio — cartera actual (1 registro)
      if (!db.objectStoreNames.contains('portfolio')) {
        db.createObjectStore('portfolio', { keyPath: 'id' });
      }

      // Store: portfolioHistory — snapshots mensuales de cartera
      if (!db.objectStoreNames.contains('portfolioHistory')) {
        db.createObjectStore('portfolioHistory', { keyPath: 'id' });
      }

      // Store: transactions — modelo de transacciones de la fase 3.4
      if (!db.objectStoreNames.contains('transactions')) {
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
        txStore.createIndex('mesId', 'mesId');
        txStore.createIndex('itemId', 'itemId');
      }

      // v3: Store: recurring — ítems recurrentes
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('recurring')) {
          db.createObjectStore('recurring', { keyPath: 'id' });
        }
      }

      // v4: Stores internos de sincronización (Supabase).
      if (oldVersion < 4) {
        // Cola de cambios locales pendientes de subir. Key = "store:id" para
        // que ediciones repetidas del mismo registro colapsen en una entrada.
        if (!db.objectStoreNames.contains('syncOutbox')) {
          db.createObjectStore('syncOutbox', { keyPath: 'key' });
        }
        // Metadatos de sync (1 registro 'state'): lastPulledAt por store, etc.
        if (!db.objectStoreNames.contains('syncMeta')) {
          db.createObjectStore('syncMeta', { keyPath: 'id' });
        }
      }
    },
  });

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
 * Importa datos JSON a la base de datos (reemplaza todo).
 * @param {Object} data
 * @returns {Promise<void>}
 */
export async function importAllData(data) {
  const db = await getDB();
  
  const storeNames = ['config', 'months', 'portfolio', 'portfolioHistory', 'transactions', 'recurring'];
  const tx = db.transaction(storeNames, 'readwrite');
  
  // Limpiar stores
  for (const name of storeNames) {
    await tx.objectStore(name).clear();
  }
  
  // Importar datos
  for (const name of storeNames) {
    if (data[name]) {
      for (const item of data[name]) {
        await tx.objectStore(name).put(item);
      }
    }
  }
  
  await tx.done;
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
