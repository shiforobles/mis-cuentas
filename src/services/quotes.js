/**
 * MIS CUENTAS — Cotizaciones de instrumentos argentinos (data912)
 *
 * Permite valuar la cartera con precios de mercado en vez de montos cargados a
 * mano. Cubre CEDEARs, acciones locales, bonos y ONs — todos cotizan en pesos
 * en el mercado local, que es como el usuario los tiene.
 *
 * Cache corto (15 min) en memoria + persistente en config para funcionar
 * offline con el último precio conocido.
 */

import { dbGet, dbPut } from '../db/database.js';

const FUENTES = [
  { url: 'https://data912.com/live/arg_cedears', tipo: 'cedear' },
  { url: 'https://data912.com/live/arg_stocks', tipo: 'accion' },
  { url: 'https://data912.com/live/arg_bonds', tipo: 'bono' },
  { url: 'https://data912.com/live/arg_corp', tipo: 'on' },
];

const CACHE_MINUTOS = 15;
let memoria = null; // { precios: {TICKER: {precio, tipo, var}}, at: number }

/**
 * Devuelve el mapa de precios { TICKER: { precio, tipo, variacion } }.
 * Prioriza el último precio operado (`c`); si no hay, usa el punto medio
 * bid/ask, y como último recurso el bid.
 * @param {boolean} [forzar=false] - ignora el cache y va a la red
 * @returns {Promise<Object>}
 */
export async function getCotizaciones(forzar = false) {
  if (!forzar && memoria && Date.now() - memoria.at < CACHE_MINUTOS * 60000) {
    return memoria.precios;
  }

  const precios = {};
  let algunaOk = false;

  await Promise.all(FUENTES.map(async ({ url, tipo }) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      for (const it of (Array.isArray(data) ? data : [])) {
        const sym = String(it?.symbol || '').toUpperCase();
        if (!sym) continue;
        const bid = Number(it.px_bid) || 0;
        const ask = Number(it.px_ask) || 0;
        const cierre = Number(it.c) || 0;
        const medio = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
        const precio = cierre > 0 ? cierre : (medio > 0 ? medio : bid);
        if (!(precio > 0)) continue;
        // Si un símbolo aparece en dos fuentes, gana el primero cargado.
        if (precios[sym]) continue;
        precios[sym] = { precio, tipo, variacion: Number(it.pct_change) || 0 };
      }
      algunaOk = true;
    } catch (e) {
      console.warn(`[cotizaciones] ${tipo}: ${e?.message}`);
    }
  }));

  if (!algunaOk || !Object.keys(precios).length) {
    // Sin red: devolver lo último que se haya guardado.
    const config = await dbGet('config', 'global');
    return config?.cotizacionesCache?.precios || {};
  }

  memoria = { precios, at: Date.now() };
  try {
    const config = await dbGet('config', 'global');
    if (config) {
      // Guardar solo los tickers que el usuario realmente usa, para no meter
      // 4000 símbolos en el registro que se sincroniza.
      const usados = tickersEnUso(await dbGet('portfolio', 'current'));
      const reducido = {};
      for (const t of usados) if (precios[t]) reducido[t] = precios[t];
      config.cotizacionesCache = { precios: reducido, at: new Date().toISOString() };
      await dbPut('config', config);
    }
  } catch { /* cachear no es crítico */ }

  return precios;
}

/**
 * Lista de tickers usados en la cartera (todas las secciones).
 * @param {Object} portfolio
 * @returns {string[]}
 */
export function tickersEnUso(portfolio) {
  const out = new Set();
  for (const sec of ['liquidez', 'inversiones']) {
    for (const item of Object.values(portfolio?.[sec] || {})) {
      for (const h of item?.holdings || []) {
        if (h?.ticker) out.add(String(h.ticker).toUpperCase());
      }
    }
  }
  return [...out];
}

/**
 * Parsea la tenencia escrita a mano: "AAPL 10, KO 5.5" o "AAPL:10 KO:5".
 * @param {string} texto
 * @returns {Array<{ticker:string, cantidad:number}>}
 */
export function parseHoldings(texto) {
  if (!texto || typeof texto !== 'string') return [];
  return texto
    // Separadores de ítems: ';', salto de línea, o coma que NO sea decimal
    // (una coma entre dígitos, como en "AL30 1500,5", es parte del número).
    .split(/[;\n]+|,(?!\d)/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(par => {
      const m = par.match(/^([A-Za-z0-9._-]+)\s*[:=\s]\s*([\d.,]+)$/);
      if (!m) return null;
      const cantidad = parseFloat(String(m[2]).replace(/\./g, '').replace(',', '.'));
      if (!(cantidad > 0)) return null;
      return { ticker: m[1].toUpperCase(), cantidad };
    })
    .filter(Boolean);
}

/** Formatea holdings a texto editable ("AAPL 10, KO 5"). */
export function holdingsATexto(holdings) {
  return (holdings || []).map(h => `${h.ticker} ${h.cantidad}`).join(', ');
}

/**
 * Valúa una lista de tenencias con los precios de mercado.
 * @param {Array<{ticker:string, cantidad:number}>} holdings
 * @param {Object} precios - mapa de getCotizaciones()
 * @returns {{ total:number, detalle:Array, faltantes:string[] }}
 */
export function valuarHoldings(holdings, precios) {
  let total = 0;
  const detalle = [];
  const faltantes = [];
  for (const h of holdings || []) {
    const t = String(h.ticker).toUpperCase();
    const p = precios?.[t];
    if (!p) { faltantes.push(t); continue; }
    const valor = p.precio * (Number(h.cantidad) || 0);
    total += valor;
    detalle.push({ ticker: t, cantidad: h.cantidad, precio: p.precio, valor, variacion: p.variacion });
  }
  return { total, detalle, faltantes };
}

/**
 * Recalcula el `monto` de todas las líneas de cartera que tengan tenencias
 * cargadas, usando precios de mercado. Las líneas sin holdings quedan como
 * están (siguen siendo de carga manual).
 *
 * @param {boolean} [forzar=false]
 * @returns {Promise<{actualizadas:number, total:number, faltantes:string[], sinTickers:boolean}>}
 */
export async function actualizarValuacionCartera(forzar = false) {
  const portfolio = await dbGet('portfolio', 'current');
  if (!portfolio) return { actualizadas: 0, total: 0, faltantes: [], sinTickers: true };

  const usados = tickersEnUso(portfolio);
  if (!usados.length) return { actualizadas: 0, total: 0, faltantes: [], sinTickers: true };

  const precios = await getCotizaciones(forzar);
  let actualizadas = 0;
  let total = 0;
  const faltantes = new Set();

  for (const sec of ['liquidez', 'inversiones']) {
    for (const item of Object.values(portfolio[sec] || {})) {
      if (!item?.holdings?.length) continue;
      const { total: valor, faltantes: f } = valuarHoldings(item.holdings, precios);
      f.forEach(x => faltantes.add(x));
      if (!(valor > 0)) continue;
      // Los precios de data912 son en pesos: si la línea está en USD no la
      // pisamos (no sabemos a qué dólar convertir sin ambigüedad).
      if ((item.moneda || 'ARS') === 'USD') continue;
      item.monto = Math.round(valor);
      item.valuadoAt = new Date().toISOString();
      actualizadas++;
      total += valor;
    }
  }

  if (actualizadas > 0) await dbPut('portfolio', portfolio);
  return { actualizadas, total, faltantes: [...faltantes], sinTickers: false };
}
