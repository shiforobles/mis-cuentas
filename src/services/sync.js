/**
 * MIS CUENTAS — Motor de sincronización con Supabase
 * Fase 3: PUSH (subir cambios locales). El pull/bidireccional es Fase 4.
 *
 * Offline-first: si no hay config o no hay sesión, no hace nada y la app sigue
 * andando con IndexedDB. Los errores de red dejan los cambios en el outbox para
 * reintentar después (no se pierden).
 */

import { getSupabase, getCurrentUser } from './supabase.js';
import {
  dbGet, dbPutRaw, dbDeleteRaw, getOutbox, removeFromOutbox, clearOutbox,
  enqueueAllForInitialPush, getSyncMeta, setSyncMeta,
} from '../db/database.js';

const EPOCH = '1970-01-01T00:00:00.000Z';
const ms = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? -1 : t; };

/** Mapeo store local (IndexedDB) → tabla remota (Supabase). */
const STORE_TO_TABLE = {
  config: 'config',
  months: 'months',
  portfolio: 'portfolio',
  portfolioHistory: 'portfolio_history',
  transactions: 'transactions',
  recurring: 'recurring',
};

/**
 * Sube al servidor las entradas pendientes del outbox (puts y borrados).
 * - put    → upsert { id, user_id, data, updated_at } en la tabla.
 * - delete → borra la fila + deja tombstone en sync_deletions.
 * Cada entrada subida con éxito se quita del outbox; las que fallan quedan para
 * reintentar.
 * @returns {Promise<{ok:boolean, reason?:string, pushed:number, deleted:number, failed:number}>}
 */
export async function pushChanges() {
  const sb = getSupabase();
  if (!sb) return { ok: false, reason: 'no-config', pushed: 0, deleted: 0, failed: 0 };

  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'no-auth', pushed: 0, deleted: 0, failed: 0 };

  const outbox = await getOutbox();
  let pushed = 0, deleted = 0, failed = 0;
  const failures = [];

  for (const entry of outbox) {
    const table = STORE_TO_TABLE[entry.store];
    if (!table) { await removeFromOutbox(entry.key); continue; }

    try {
      if (entry.op === 'delete') {
        const { error: delErr } = await sb.from(table).delete().eq('id', entry.recordId);
        if (delErr) throw delErr;
        const { error: tombErr } = await sb.from('sync_deletions').upsert(
          { user_id: user.id, store: entry.store, id: entry.recordId, deleted_at: entry.updatedAt },
          { onConflict: 'user_id,store,id' }
        );
        if (tombErr) throw tombErr;
        deleted++;
      } else {
        const record = await dbGet(entry.store, entry.recordId);
        if (!record) { await removeFromOutbox(entry.key); continue; } // ya no existe local
        const row = {
          id: entry.recordId,
          user_id: user.id,
          data: record,
          updated_at: record.updatedAt || entry.updatedAt || new Date().toISOString(),
        };
        const { error } = await sb.from(table).upsert(row, { onConflict: 'user_id,id' });
        if (error) throw error;
        pushed++;
      }
      await removeFromOutbox(entry.key);
    } catch (err) {
      failed++;
      // PostgrestError trae message/code/details/hint. Capturamos todo.
      failures.push({
        tabla: table,
        store: entry.store,
        id: entry.recordId,
        op: entry.op,
        error: err?.message || String(err),
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      });
      // se deja la entrada en el outbox para reintentar
    }
  }

  if (failures.length) {
    // Resumen agrupado por tabla + detalle de cada registro fallido.
    const porTabla = failures.reduce((acc, f) => { acc[f.tabla] = (acc[f.tabla] || 0) + 1; return acc; }, {});
    console.error('[sync] Push: %d registro(s) fallaron. Por tabla:', failures.length, porTabla);
    console.table(failures.map(f => ({ tabla: f.tabla, id: f.id, op: f.op, code: f.code, error: f.error, details: f.details, hint: f.hint })));
    console.error('[sync] Detalle completo de fallos:', failures);
  }

  return { ok: failed === 0, pushed, deleted, failed, failures };
}

/**
 * Push inicial / "subir todo": encola todos los registros locales y los sube.
 * Idempotente (usa upsert), así que reejecutarlo no duplica. Marca el primer
 * merge como resuelto (este dispositivo pasa a ser la base de la nube).
 * @returns {Promise<{ok:boolean, reason?:string, pushed:number, deleted:number, failed:number}>}
 */
export async function fullPush() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'no-auth', pushed: 0, deleted: 0, failed: 0 };
  await enqueueAllForInitialPush();
  const r = await pushChanges();
  await markFirstMergeDone();
  return r;
}

// ─── PULL (bajar cambios remotos, last-write-wins) ──────────

/**
 * Baja de Supabase los registros con `updated_at` más nuevo que el último pull y
 * los aplica a IndexedDB resolviendo por last-write-wins (gana el `updatedAt`
 * mayor). También aplica los borrados remotos (tombstones de sync_deletions).
 * Escribe con dbPutRaw/dbDeleteRaw para NO re-encolar (no genera loop de push).
 *
 * @param {{remoteWins?: boolean}} [opts] - remoteWins fuerza que lo remoto pise
 *   lo local sin comparar (se usa en el primer merge "usar la nube").
 * @returns {Promise<{ok:boolean, reason?:string, pulled:number, deletedLocal:number, failed:number}>}
 */
export async function pullChanges({ remoteWins = false } = {}) {
  const sb = getSupabase();
  if (!sb) return { ok: false, reason: 'no-config', pulled: 0, deletedLocal: 0, failed: 0 };
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'no-auth', pulled: 0, deletedLocal: 0, failed: 0 };

  const meta = await getSyncMeta();
  meta.lastPulledAt = meta.lastPulledAt || {};
  const pendingKeys = new Set((await getOutbox()).map(e => e.key));

  let pulled = 0, deletedLocal = 0, failed = 0;

  // 1) Upserts remotos por tabla
  for (const [store, table] of Object.entries(STORE_TO_TABLE)) {
    const last = meta.lastPulledAt[store] || EPOCH;
    const { data: rows, error } = await sb.from(table)
      .select('id,data,updated_at').gt('updated_at', last);
    if (error) { failed++; console.warn('[sync] pull error en', table, error.message); continue; }

    let maxMs = ms(last), maxStr = last;
    for (const row of rows || []) {
      if (!row.data) continue;
      const rMs = ms(row.updated_at);
      if (rMs > maxMs) { maxMs = rMs; maxStr = row.updated_at; }

      const local = await dbGet(store, row.id);
      const lMs = local?.updatedAt ? ms(local.updatedAt) : -1;
      // LWW: si lo local es igual o más nuevo, lo dejamos (salvo remoteWins).
      if (!remoteWins && local && lMs >= rMs) continue;

      await dbPutRaw(store, row.data);
      pulled++;
      const key = `${store}:${row.id}`;
      if (pendingKeys.has(key)) { await removeFromOutbox(key); pendingKeys.delete(key); }
    }
    meta.lastPulledAt[store] = maxStr;
  }

  // 2) Borrados remotos (tombstones)
  const lastDel = meta.lastPulledAt.__deletions__ || EPOCH;
  const { data: tombs, error: delErr } = await sb.from('sync_deletions')
    .select('store,id,deleted_at').gt('deleted_at', lastDel);
  if (delErr) {
    failed++; console.warn('[sync] pull tombstones error', delErr.message);
  } else {
    let maxMs = ms(lastDel), maxStr = lastDel;
    for (const t of tombs || []) {
      const dMs = ms(t.deleted_at);
      if (dMs > maxMs) { maxMs = dMs; maxStr = t.deleted_at; }
      const local = await dbGet(t.store, t.id);
      if (!local) continue;
      const lMs = local.updatedAt ? ms(local.updatedAt) : -1;
      // Borramos si el tombstone es más nuevo que lo local (o remoteWins).
      if (remoteWins || lMs < dMs) {
        await dbDeleteRaw(t.store, t.id);
        deletedLocal++;
        const key = `${t.store}:${t.id}`;
        if (pendingKeys.has(key)) { await removeFromOutbox(key); pendingKeys.delete(key); }
      }
    }
    meta.lastPulledAt.__deletions__ = maxStr;
  }

  await setSyncMeta(meta);
  return { ok: failed === 0, pulled, deletedLocal, failed };
}

/**
 * Sincronización completa: primero sube lo local (push) y después baja lo
 * remoto (pull con last-write-wins). Orden push→pull para minimizar pisadas.
 * @returns {Promise<{ok:boolean, push:object, pull:object}>}
 */
export async function syncNow() {
  const push = await pushChanges();
  const pull = await pullChanges();
  return { ok: push.ok && pull.ok, push, pull };
}

// ─── PRIMER MERGE (datos en nube y en dispositivo) ──────────

/** ¿Hay algún dato en la nube? (para decidir el primer merge). */
export async function remoteHasData() {
  const sb = getSupabase();
  if (!sb) return false;
  for (const table of Object.values(STORE_TO_TABLE)) {
    const { count, error } = await sb.from(table).select('id', { count: 'exact', head: true });
    if (!error && (count || 0) > 0) return true;
  }
  return false;
}

/**
 * ¿Hay que decidir el primer merge? True si este dispositivo nunca resolvió el
 * merge inicial y la nube ya tiene datos (escenario: segundo dispositivo).
 */
export async function isFirstMergePending() {
  const user = await getCurrentUser();
  if (!user) return false;
  const meta = await getSyncMeta();
  if (meta.firstMergeDone) return false;
  return remoteHasData();
}

async function markFirstMergeDone() {
  const meta = await getSyncMeta();
  meta.firstMergeDone = true;
  await setSyncMeta(meta);
}

/**
 * Resuelve el primer merge según la elección del usuario:
 *  - 'cloud': la nube manda (baja todo, pisa lo local, descarta pendientes).
 *  - 'local': sube lo de este dispositivo.
 *  - 'merge': combina por last-write-wins (push + pull).
 * @param {'cloud'|'local'|'merge'} mode
 */
export async function firstSync(mode) {
  const result = { mode };
  if (mode === 'cloud') {
    result.pull = await pullChanges({ remoteWins: true });
    await clearOutbox();
  } else if (mode === 'local') {
    result.push = await fullPush();
  } else {
    result.push = await pushChanges();
    result.pull = await pullChanges();
  }
  await markFirstMergeDone();
  return result;
}
