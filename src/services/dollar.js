/**
 * MIS CUENTAS — Servicio del Dólar CCL
 * Integración con DolarAPI + cache + dólar POR MES.
 * 
 * Lógica: cada mes tiene su propio dolarCCL almacenado en el registro del mes.
 * La API solo actualiza el MES EN CURSO. Los meses pasados quedan congelados.
 */

import { dbGet, dbPut, dbGetAll } from '../db/database.js';
import { mesKey, parseMesKey } from '../utils/constants.js';

const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares';
const BLUELYTICS_URL = 'https://api.bluelytics.com.ar/v2/latest';

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

/**
 * Obtiene el mesKey actual (ej: 'mayo-2026').
 */
async function getMesKeyActual() {
  const config = await dbGet('config', 'global');
  const año = config?.año || 2026;
  return mesKey(MESES[new Date().getMonth()], año);
}

/**
 * Obtiene la cotización del dólar CCL desde la API.
 * Guarda en config (cache global) Y en el mes en curso.
 * @returns {Promise<{ ccl: number, todas: Object, fecha: string }>}
 */
export async function fetchDolar() {
  let result = null;

  // Intentar DolarAPI
  try {
    const response = await fetch(DOLAR_API_URL, { signal: AbortSignal.timeout(8000) });
    if (response.ok) {
      const data = await response.json();
      result = parseDolarAPI(data);
    }
  } catch (e) {
    console.warn('DolarAPI falló, intentando Bluelytics...', e.message);
  }

  // Fallback: Bluelytics
  if (!result) {
    try {
      const response = await fetch(BLUELYTICS_URL, { signal: AbortSignal.timeout(8000) });
      if (response.ok) {
        const data = await response.json();
        result = parseBluelytics(data);
      }
    } catch (e) {
      console.warn('Bluelytics falló, usando cache...', e.message);
    }
  }

  if (!result) return getCachedDolar();

  // Guardar en config global (cache)
  await cacheDolarGlobal(result);

  // Guardar en el MES EN CURSO (solo el actual, nunca pisar meses pasados)
  const currentMesKey = await getMesKeyActual();
  await saveDolarToMonth(currentMesKey, result.ccl);

  return result;
}

function parseDolarAPI(data) {
  const todas = {};
  let cclVenta = 0;
  let fecha = null;
  for (const item of data) {
    todas[item.casa] = { nombre: item.nombre, compra: item.compra, venta: item.venta, fecha: item.fechaActualizacion };
    if (item.casa === 'contadoconliqui') {
      cclVenta = item.venta;
      fecha = item.fechaActualizacion;
    }
  }
  return { ccl: cclVenta, todas, fecha: fecha || new Date().toISOString() };
}

function parseBluelytics(data) {
  const blue = data.blue || {};
  return {
    ccl: blue.value_sell || blue.value_avg || 0,
    todas: {
      oficial: { nombre: 'Oficial', compra: data.oficial?.value_buy, venta: data.oficial?.value_sell },
      blue: { nombre: 'Blue', compra: blue.value_buy, venta: blue.value_sell },
    },
    fecha: data.last_update || new Date().toISOString(),
  };
}

// ─── Cache global (config) ──────────────────────────────
async function cacheDolarGlobal(dolarData) {
  try {
    const config = await dbGet('config', 'global');
    if (config) {
      config.dolarCCL = dolarData.ccl;
      config.dolarTodas = dolarData.todas;
      config.dolarCCLFechaUpdate = dolarData.fecha;
      await dbPut('config', config);
    }
  } catch (e) {
    console.error('Error cacheando dólar:', e);
  }
}

async function getCachedDolar() {
  const config = await dbGet('config', 'global');
  return {
    ccl: config?.dolarCCL || 1488.8,
    todas: config?.dolarTodas || null,
    fecha: config?.dolarCCLFechaUpdate || null,
  };
}

// ─── Dólar POR MES ──────────────────────────────────────

/**
 * Guarda el dólar CCL en un mes específico Y en el registro histórico durable.
 * Único punto de escritura del dólar por mes: mantiene month.dolarCCL y
 * config.dolarHistorico sincronizados.
 * @param {string} monthKey - ej: 'mayo-2026'
 * @param {number} valor
 * @param {Object} [monthObj] - registro del mes ya cargado; si se pasa, se
 *   muta y escribe una sola vez (evita un dbGet/dbPut redundante del mismo mes).
 */
export async function saveDolarToMonth(monthKey, valor, monthObj = null) {
  const month = monthObj || await dbGet('months', monthKey);
  if (month) {
    month.dolarCCL = valor;
    await dbPut('months', month);
  }
  const config = await dbGet('config', 'global');
  if (config) {
    config.dolarHistorico = config.dolarHistorico || {};
    config.dolarHistorico[monthKey] = valor;
    await dbPut('config', config);
  }
}

/** Índice cronológico de un mesKey (año*12 + mes) para comparar orden temporal. */
function mesKeyIndex(key) {
  const { mesId, año } = parseMesKey(key);
  return año * 12 + MESES.indexOf(mesId);
}

/**
 * Busca el dólar conocido más reciente ANTERIOR al mes pedido.
 * Fusiona config.dolarHistorico con los dolarCCL ya guardados en cada mes
 * (robusto ante datos previos a la introducción del histórico).
 * @param {string} monthKey
 * @param {Object} config
 * @returns {Promise<number|null>}
 */
async function findPriorDolar(monthKey, config) {
  const target = mesKeyIndex(monthKey);
  const known = { ...(config?.dolarHistorico || {}) };
  const months = await dbGetAll('months');
  for (const m of months) {
    if (m?.dolarCCL && !known[m.id]) known[m.id] = m.dolarCCL;
  }
  let best = null;
  let bestIdx = -Infinity;
  for (const [k, v] of Object.entries(known)) {
    const idx = mesKeyIndex(k);
    if (idx < target && idx > bestIdx) {
      bestIdx = idx;
      best = v;
    }
  }
  return best;
}

/**
 * Obtiene el dólar CCL de un mes específico.
 * Prioridad: dólar propio del mes → histórico exacto → último conocido anterior
 * → override manual global → dólar global (solo estimación para meses sin historia).
 * Un cambio del dólar de hoy nunca recalcula los USD de meses ya vividos.
 * @param {string} [monthKey] - ej: 'mayo-2026'. Si no se pasa, usa el mes actual.
 * @returns {Promise<number>}
 */
export async function getDolarCCL(monthKey) {
  const config = await dbGet('config', 'global');

  if (monthKey) {
    const month = await dbGet('months', monthKey);
    if (month?.dolarCCL) return month.dolarCCL;

    const hist = config?.dolarHistorico?.[monthKey];
    if (hist) return hist;

    const prior = await findPriorDolar(monthKey, config);
    if (prior) return prior;
  }

  if (config?.dolarCCLManual != null) return config.dolarCCLManual;
  return config?.dolarCCL || 1488.8;
}

/**
 * Obtiene el dólar CCL "actual" (global, para el widget).
 * @returns {Promise<number>}
 */
export async function getDolarActual() {
  const config = await dbGet('config', 'global');
  if (config?.dolarCCLManual != null) return config.dolarCCLManual;
  return config?.dolarCCL || 1488.8;
}

/**
 * Override manual global (se usa para forzar un valor en el widget).
 * @param {number|null} value
 */
export async function setDolarManual(value) {
  const config = await dbGet('config', 'global');
  if (config) {
    config.dolarCCLManual = value;
    if (value !== null) config.dolarCCL = value;
    await dbPut('config', config);
  }
}
