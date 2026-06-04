/**
 * MIS CUENTAS — Servicio de Historial de Cartera
 * Guarda snapshots mensuales para tracking de evolución patrimonial.
 */

import { dbGet, dbPut, dbGetAll, dbDelete } from '../db/database.js';
import { calcCartera } from './calculations.js';
import { getDolarCCL } from './dollar.js';
import { MESES } from '../utils/constants.js';

/**
 * Toma un snapshot del portfolio actual y lo guarda en portfolioHistory.
 * Se identifica por mesId (ej: 'mayo-2026').
 * @param {string} mesId - Identificador del mes (ej: 'mayo')
 */
export async function takePortfolioSnapshot(mesId) {
  const portfolio = await dbGet('portfolio', 'current');
  if (!portfolio) return null;

  const config = await dbGet('config', 'global');
  const dolarCCL = await getDolarCCL();
  const cartera = calcCartera(portfolio, dolarCCL);
  if (!cartera) return null;

  const año = config?.año || new Date().getFullYear();
  const snapshotId = `${mesId}-${año}`;

  const snapshot = {
    id: snapshotId,
    mesId,
    año,
    fecha: new Date().toISOString(),
    dolarCCL,
    granTotalARS: cartera.totals.granTotalARS,
    granTotalUSD: cartera.totals.granTotalUSD,
    liquidezARS: cartera.totals.liquidezARS,
    liquidezUSD: cartera.totals.liquidezUSD,
    inversionesARS: cartera.totals.inversionesARS,
    inversionesUSD: cartera.totals.inversionesUSD,
    // Detalle por línea
    detalle: {
      liquidez: Object.fromEntries(
        Object.entries(cartera.liquidez).map(([k, v]) => [k, { ars: v.ars, usd: v.usd }])
      ),
      inversiones: Object.fromEntries(
        Object.entries(cartera.inversiones).map(([k, v]) => [k, { ars: v.ars, usd: v.usd }])
      ),
    },
  };

  await dbPut('portfolioHistory', snapshot);
  return snapshot;
}

/**
 * Toma un snapshot del mes calendario actual (atajo de takePortfolioSnapshot).
 * @returns {Promise<Object|null>} el snapshot guardado, o null si no hay cartera.
 */
export async function snapshotCurrentMonth() {
  const mesActual = MESES[new Date().getMonth()];
  return takePortfolioSnapshot(mesActual);
}

/**
 * Elimina un snapshot puntual del historial.
 * @param {string} id - id del snapshot (ej: 'junio-2026')
 */
export async function deletePortfolioSnapshot(id) {
  await dbDelete('portfolioHistory', id);
}

/**
 * Obtiene todos los snapshots del año actual, ordenados cronológicamente.
 * @returns {Array} - Array de snapshots ordenados Ene→Dic
 */
export async function getPortfolioHistory() {
  const all = await dbGetAll('portfolioHistory');
  // Ordenar por índice de mes
  return all.sort((a, b) => {
    return MESES.indexOf(a.mesId) - MESES.indexOf(b.mesId);
  });
}

/**
 * Obtiene snapshots filtrados por año.
 * @param {number} año
 * @returns {Promise<Array>}
 */
export async function getPortfolioHistoryByYear(año) {
  const all = await dbGetAll('portfolioHistory');
  return all
    .filter(s => s.año === año)
    .sort((a, b) => MESES.indexOf(a.mesId) - MESES.indexOf(b.mesId));
}

/**
 * Calcula la evolución de la cartera (Δ mes a mes).
 * @param {Array} snapshots - Array de snapshots ordenados cronológicamente
 * @returns {Array} - Array con datos de evolución
 */
export function calcPortfolioEvolution(snapshots) {
  return snapshots.map((snap, i) => {
    const prev = i > 0 ? snapshots[i - 1] : null;
    return {
      ...snap,
      deltaARS: prev ? snap.granTotalARS - prev.granTotalARS : 0,
      deltaUSD: prev ? snap.granTotalUSD - prev.granTotalUSD : 0,
      deltaPercent: prev && prev.granTotalARS > 0
        ? ((snap.granTotalARS - prev.granTotalARS) / prev.granTotalARS) * 100
        : 0,
    };
  });
}
