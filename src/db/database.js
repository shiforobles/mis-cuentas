/**
 * MIS CUENTAS — Base de datos IndexedDB
 * Usa la librería 'idb' como wrapper para una API más limpia con async/await.
 */

import { openDB } from 'idb';

const DB_NAME = 'mis-cuentas-db';
const DB_VERSION = 3;

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
 * Escribe (put) un registro en un store.
 * @param {string} storeName
 * @param {any} value
 * @returns {Promise<string>}
 */
export async function dbPut(storeName, value) {
  const db = await getDB();
  return db.put(storeName, value);
}

/**
 * Elimina un registro de un store.
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function dbDelete(storeName, key) {
  const db = await getDB();
  return db.delete(storeName, key);
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
