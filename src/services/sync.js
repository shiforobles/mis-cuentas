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
  dbGet, getOutbox, removeFromOutbox, enqueueAllForInitialPush,
} from '../db/database.js';

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
 * Idempotente (usa upsert), así que reejecutarlo no duplica.
 * @returns {Promise<{ok:boolean, reason?:string, pushed:number, deleted:number, failed:number}>}
 */
export async function fullPush() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'no-auth', pushed: 0, deleted: 0, failed: 0 };
  await enqueueAllForInitialPush();
  return pushChanges();
}
