/**
 * MIS CUENTAS — Cliente Supabase (Fase 1: auth + conexión)
 *
 * Offline-first: si NO hay credenciales configuradas (env vars), todo esto
 * queda inerte y la app sigue funcionando 100% con IndexedDB. Supabase es una
 * capa OPCIONAL encima; nunca debe romper el uso local.
 */

import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;

// Clave pública del cliente. Soporta tanto el formato NUEVO de Supabase
// (publishable key: "sb_publishable_...") como la anon key legacy ("eyJ...").
// Ambas son seguras para el browser SIEMPRE con RLS activado. supabase-js la usa
// como header `apikey` y no la decodifica como JWT, así que el formato nuevo
// funciona sin configuración extra. Se acepta bajo cualquiera de estos nombres
// de env var (preferimos el explícito si está presente).
const PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

let client = null;

/**
 * ¿Están las credenciales de Supabase configuradas?
 * @returns {boolean}
 */
export function isSupabaseConfigured() {
  return Boolean(URL && PUBLIC_KEY);
}

/**
 * Devuelve el cliente Supabase (singleton), o null si no está configurado.
 * La sesión se persiste sola en localStorage (persistSession) y el token se
 * refresca automáticamente.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(URL, PUBLIC_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'mis-cuentas-auth',
      },
    });
  }
  return client;
}

// ─── Auth helpers ───────────────────────────────────────

/**
 * Inicia sesión con email + contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, error: string|null }>}
 */
export async function signIn(email, password) {
  const sb = getSupabase();
  if (!sb) return { user: null, error: 'Supabase no está configurado' };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  return { user: data?.user || null, error: error?.message || null };
}

/**
 * Registra un usuario nuevo con email + contraseña.
 * (Para este proyecto de un solo usuario; si "Confirm email" está desactivado
 * en Supabase, queda logueado de inmediato.)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ user: object|null, error: string|null, needsConfirm: boolean }>}
 */
export async function signUp(email, password) {
  const sb = getSupabase();
  if (!sb) return { user: null, error: 'Supabase no está configurado', needsConfirm: false };
  const { data, error } = await sb.auth.signUp({ email, password });
  // Si hay user pero no session, Supabase está esperando confirmación por email.
  const needsConfirm = Boolean(data?.user && !data?.session);
  return { user: data?.user || null, error: error?.message || null, needsConfirm };
}

/**
 * Cierra la sesión.
 * @returns {Promise<{ error: string|null }>}
 */
export async function signOut() {
  const sb = getSupabase();
  if (!sb) return { error: null };
  const { error } = await sb.auth.signOut();
  return { error: error?.message || null };
}

/**
 * Devuelve la sesión actual (o null). No hace red si ya está cacheada.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session || null;
}

/**
 * Devuelve el usuario logueado (o null).
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/**
 * Suscribe a cambios de estado de auth (login/logout/refresh).
 * @param {(event: string, session: object|null) => void} cb
 * @returns {() => void} función para desuscribirse
 */
export function onAuthChange(cb) {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data?.subscription?.unsubscribe?.();
}
