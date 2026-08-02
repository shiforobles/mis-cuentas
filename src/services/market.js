/**
 * MIS CUENTAS — Datos de mercado para contexto de inversión
 *
 * Tres fuentes, todas públicas y sin API key, cacheadas en config para que la
 * app siga andando offline:
 *  - Tasa de plazo fijo (BCRA vía ArgentinaDatos) → ¿tus pesos le ganan a la inflación?
 *  - Serie histórica del CCL desde 2013 (ArgentinaDatos) → dólar caro/barato en términos reales.
 *  - Serie histórica del SPY (data912) → benchmark S&P 500 para la cartera.
 */

import { dbGet, dbPut } from '../db/database.js';

const CACHE_HORAS = 24;
const PLAZO_FIJO_URL = 'https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo';
const CCL_HIST_URL = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui';
const SPY_HIST_URL = 'https://data912.com/historical/usa_stocks/SPY';

/** ¿El valor cacheado sigue fresco? */
function esFresco(iso) {
  if (!iso) return false;
  return Date.now() - Date.parse(iso) < CACHE_HORAS * 3600 * 1000;
}

/**
 * Lee de cache o descarga y cachea bajo `campo` en el config.
 * @param {string} campo - clave dentro de config
 * @param {() => Promise<any>} fetcher - devuelve el valor a cachear (o null)
 * @returns {Promise<any|null>}
 */
async function cachedFetch(campo, fetcher) {
  const config = await dbGet('config', 'global');
  const guardado = config?.[campo];
  if (guardado && esFresco(guardado.fetchedAt)) return guardado;

  try {
    const valor = await fetcher();
    if (!valor) return guardado || null;
    const conMeta = { ...valor, fetchedAt: new Date().toISOString() };
    if (config) {
      config[campo] = conMeta;
      await dbPut('config', config);
    }
    return conMeta;
  } catch (e) {
    console.warn(`[market] ${campo}: falló la descarga, uso cache:`, e?.message);
    return guardado || null;
  }
}

// ─── 1. TASAS EN PESOS (plazo fijo) ─────────────────────────

/**
 * Mejor tasa de plazo fijo del mercado y promedio, en TNA (% anual).
 * @returns {Promise<{mejor:{entidad:string,tna:number}|null, promedioTNA:number, bancos:number}|null>}
 */
export async function getTasaPlazoFijo() {
  return cachedFetch('tasaPlazoFijo', async () => {
    const res = await fetch(PLAZO_FIJO_URL, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // tnaClientes viene como fracción (0.19 = 19% TNA). Descartamos ceros.
    const conTasa = (Array.isArray(data) ? data : [])
      .map(b => ({ entidad: b.entidad, tna: (Number(b.tnaClientes) || 0) * 100 }))
      .filter(b => b.tna > 0)
      .sort((a, b) => b.tna - a.tna);
    if (!conTasa.length) return null;
    const promedioTNA = conTasa.reduce((s, b) => s + b.tna, 0) / conTasa.length;
    return { mejor: conTasa[0], promedioTNA, bancos: conTasa.length };
  });
}

/**
 * Convierte una TNA (% anual, capitalización mensual) a su equivalente mensual efectivo.
 * @param {number} tna - ej: 30 (=30% anual)
 * @returns {number} % mensual
 */
export function tnaAMensual(tna) {
  return (Number(tna) || 0) / 12;
}

// ─── 2. CCL HISTÓRICO (dólar caro o barato) ─────────────────

/**
 * Serie mensual del CCL (último valor de cada mes) desde 2013.
 * @returns {Promise<{serie:Array<{mes:string, valor:number}>}|null>}
 */
export async function getCCLHistoricoMensual() {
  return cachedFetch('cclHistorico', async () => {
    const res = await fetch(CCL_HIST_URL, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const porMes = new Map();
    for (const d of (Array.isArray(data) ? data : [])) {
      const v = Number(d?.venta) || 0;
      if (!d?.fecha || v <= 0) continue;
      porMes.set(d.fecha.slice(0, 7), v); // 'YYYY-MM' → último del mes gana
    }
    const serie = [...porMes.entries()]
      .map(([mes, valor]) => ({ mes, valor }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    return serie.length ? { serie } : null;
  });
}

/**
 * "Dólar caro o barato": compara el CCL de hoy contra el CCL histórico
 * actualizado por inflación argentina y estadounidense.
 *
 * Un dólar de hace N meses "vale hoy" (en pesos de hoy):
 *     CCL_viejo × (inflación ARS acumulada desde entonces)
 *                ÷ (inflación USD acumulada desde entonces)
 *
 * El promedio de esos valores traídos a hoy es el "CCL real promedio":
 * si el CCL de hoy está por encima, el dólar está caro en términos reales.
 *
 * @param {number} cclHoy
 * @param {Array<{mes:string, valor:number}>} serieCCL - mensual, ascendente
 * @param {Array<{fecha:string, valor:number}>} inflacionARS - IPC mensual %
 * @param {Array<{fecha:string, valor:number}>} inflacionUSA - CPI mensual %
 * @param {number} [años=5] - ventana de comparación
 * @returns {{serieReal:Array<{mes:string, real:number}>, promedio:number, desvioPct:number, cclHoy:number, meses:number}|null}
 */
export function calcDolarRealHistorico(cclHoy, serieCCL, inflacionARS, inflacionUSA, años = 5) {
  if (!(cclHoy > 0) || !serieCCL?.length) return null;

  /**
   * Nivel de precios acumulado por mes: 'YYYY-MM' → índice (base 1 al inicio
   * de la serie). Traer un valor del mes M a hoy es multiplicarlo por
   * nivelHoy / nivel[M]. Se calcula una sola vez (lineal).
   */
  const nivelDe = (serie) => {
    const niveles = new Map();
    let nivel = 1;
    for (const d of [...(serie || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))) {
      if (!d?.fecha) continue;
      nivel *= 1 + (Number(d.valor) || 0) / 100;
      niveles.set(d.fecha.slice(0, 7), nivel);
    }
    return niveles;
  };
  const nivelARS = nivelDe(inflacionARS);
  const nivelUSA = nivelDe(inflacionUSA);
  if (!nivelARS.size || !nivelUSA.size) return null;

  // Solo podemos ajustar meses que tengan dato de inflación en AMBOS países.
  const mesesComunes = [...nivelARS.keys()].filter(m => nivelUSA.has(m)).sort();
  if (mesesComunes.length < 6) return null;
  const mesBase = mesesComunes[0];
  const mesUltimo = mesesComunes[mesesComunes.length - 1];
  const hoyARS = nivelARS.get(mesUltimo);
  const hoyUSA = nivelUSA.get(mesUltimo);

  const desde = new Date();
  desde.setFullYear(desde.getFullYear() - años);
  const desdeMes = desde.toISOString().slice(0, 7);
  const limite = desdeMes > mesBase ? desdeMes : mesBase;
  const ventana = serieCCL.filter(d => d.mes >= limite && nivelARS.has(d.mes) && nivelUSA.has(d.mes));
  if (ventana.length < 6) return null;

  // Traer cada CCL pasado a pesos de hoy, ajustando por ambas inflaciones.
  const serieReal = ventana.map(punto => ({
    mes: punto.mes,
    real: punto.valor * (hoyARS / nivelARS.get(punto.mes)) / (hoyUSA / nivelUSA.get(punto.mes)),
  }));
  if (!serieReal.length) return null;

  const promedio = serieReal.reduce((s, d) => s + d.real, 0) / serieReal.length;
  return {
    serieReal,
    promedio,
    desvioPct: promedio > 0 ? ((cclHoy / promedio) - 1) * 100 : 0,
    cclHoy,
    meses: serieReal.length,
  };
}

// ─── 3. S&P 500 (benchmark de la cartera) ───────────────────

/**
 * Serie mensual del SPY (último cierre de cada mes) como proxy del S&P 500.
 * @returns {Promise<{serie:Array<{mes:string, precio:number}>}|null>}
 */
export async function getSP500Mensual() {
  return cachedFetch('sp500', async () => {
    const res = await fetch(SPY_HIST_URL, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fechas = data?.dates || [];
    const precios = data?.prices || [];
    if (!fechas.length || fechas.length !== precios.length) return null;
    const porMes = new Map();
    for (let i = 0; i < fechas.length; i++) {
      const p = Number(precios[i]);
      if (!(p > 0)) continue;
      porMes.set(String(fechas[i]).slice(0, 7), p); // último cierre del mes
    }
    const serie = [...porMes.entries()]
      .map(([mes, precio]) => ({ mes, precio }))
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-60);
    return serie.length ? { serie } : null;
  });
}

/**
 * Variación % del S&P 500 entre dos meses ('YYYY-MM'). Null si falta algún dato.
 * @param {Array<{mes:string, precio:number}>} serie
 * @param {string} mesDesde
 * @param {string} mesHasta
 * @returns {number|null}
 */
export function variacionSP500(serie, mesDesde, mesHasta) {
  if (!serie?.length) return null;
  const buscar = (mes) => serie.find(d => d.mes === mes)?.precio ?? null;
  const a = buscar(mesDesde);
  const b = buscar(mesHasta);
  if (!(a > 0) || !(b > 0)) return null;
  return ((b / a) - 1) * 100;
}
