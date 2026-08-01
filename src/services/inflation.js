/**
 * MIS CUENTAS — Servicio de Inflación (IPC INDEC)
 * Trae la serie mensual de inflación de ArgentinaDatos (misma familia de API
 * que el dólar) y la cachea en config para funcionar offline. El IPC de un mes
 * se publica a mitad del mes siguiente, así que los últimos 1-2 meses pueden
 * no estar todavía.
 */

import { dbGet, dbPut } from '../db/database.js';

const INFLACION_API_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const CACHE_HORAS = 24;

/**
 * Devuelve la serie completa de inflación mensual [{fecha:'YYYY-MM-DD', valor:%}].
 * Usa cache de config si tiene menos de 24hs o si la red falla.
 * @returns {Promise<Array<{fecha:string, valor:number}>>}
 */
export async function getInflacionSerie() {
  const config = await dbGet('config', 'global');
  const cache = config?.inflacionSerie;
  const fetchedAt = config?.inflacionFetchedAt ? Date.parse(config.inflacionFetchedAt) : 0;
  const fresh = Date.now() - fetchedAt < CACHE_HORAS * 3600 * 1000;

  if (cache && fresh) return cache;

  try {
    const res = await fetch(INFLACION_API_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const serie = (Array.isArray(data) ? data : [])
      .filter(d => d && d.fecha && typeof d.valor === 'number')
      .map(d => ({ fecha: d.fecha, valor: d.valor }))
      .slice(-48); // últimos 4 años alcanzan y mantienen liviano el config sincronizado
    if (serie.length && config) {
      config.inflacionSerie = serie;
      config.inflacionFetchedAt = new Date().toISOString();
      await dbPut('config', config);
    }
    return serie.length ? serie : (cache || []);
  } catch (e) {
    console.warn('[inflación] API falló, usando cache:', e?.message);
    return cache || [];
  }
}

/**
 * Inflación mensual de un año dado: array de 12 posiciones (ene..dic) con el
 * % del mes o null si aún no se publicó.
 * @param {number} año
 * @returns {Promise<Array<number|null>>}
 */
export async function getInflacionYear(año) {
  const serie = await getInflacionSerie();
  const meses = new Array(12).fill(null);
  for (const d of serie) {
    const [y, m] = d.fecha.split('-').map(Number);
    if (y === año && m >= 1 && m <= 12) meses[m - 1] = d.valor;
  }
  return meses;
}

/**
 * Acumula una serie de variaciones mensuales (%): devuelve el % acumulado
 * hasta cada mes inclusive (interés compuesto), null donde no hay dato aún.
 * Ej: [2, 3, null] → [2, 5.06, null]
 * @param {Array<number|null>} mensual
 * @returns {Array<number|null>}
 */
export function acumularInflacion(mensual) {
  let indice = 1;
  return mensual.map(v => {
    if (v == null) return null;
    indice *= 1 + v / 100;
    return (indice - 1) * 100;
  });
}

/**
 * Variación % acumulada del dólar por mes contra el valor de arranque.
 * Toma dolarPorMes (dólar resuelto de cada mes) y devuelve el % de suba
 * respecto de diciembre anterior (aprox: primer mes con dato como base).
 * @param {number[]} dolarPorMes - índice 0-11
 * @param {number} nMeses - meses transcurridos a considerar
 * @returns {Array<number|null>}
 */
export function acumularDolar(dolarPorMes, nMeses) {
  const out = new Array(12).fill(null);
  let base = null;
  for (let i = 0; i < Math.min(nMeses, 12); i++) {
    const v = dolarPorMes[i];
    if (!(v > 0)) continue;
    if (base == null) base = v; // primer mes con dato = base
    out[i] = ((v / base) - 1) * 100;
  }
  return out;
}
