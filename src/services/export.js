/**
 * MIS CUENTAS — Servicio de Exportación
 * Export a Excel (.xlsx) y PDF (vía window.print con CSS).
 */

import { dbGetAll, dbGet } from '../db/database.js';
import { getDolarCCL, getDolarActual } from './dollar.js';
import { calcTotalIngresos, calcTotalEgresos, calcIngresosUSD, calcSubtotalCategoria, calcTotalMovimientosCapital } from './calculations.js';
import { MESES, MESES_LABEL, CATEGORIAS_EGRESO, mesKey } from '../utils/constants.js';

// ─── EXPORT EXCEL ────────────────────────────────────────
/**
 * Exporta todos los datos a un archivo .xlsx con estructura similar al Excel original.
 */
export async function exportToExcel() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const config = await dbGet('config', 'global');
  const portfolio = await dbGet('portfolio', 'current');
  const dolarGlobal = await getDolarActual();
  const año = config?.año || 2026;

  // --- Hoja Dashboard ---
  const dashRows = [
    ['DASHBOARD', año],
    [],
    ['Mes', 'Dólar CCL', 'Ingresos $', 'Ingresos USD', 'Ahorro $', 'Ahorro USD'],
  ];

  let totalIng = 0, totalAh = 0;
  for (let i = 0; i < MESES.length; i++) {
    const m = await dbGet('months', mesKey(MESES[i], año));
    if (!m) { dashRows.push([MESES_LABEL[i]]); continue; }
    const ing = calcTotalIngresos(m.ingresos, 'proyectado');
    const eg = calcTotalEgresos(m.egresos, 'proyectado');
    const dm = (await getDolarCCL(mesKey(MESES[i], año))) || dolarGlobal;
    const ah = ing - eg;
    totalIng += ing; totalAh += ah;
    dashRows.push([MESES_LABEL[i], dm, ing, calcIngresosUSD(ing, dm), ah, calcIngresosUSD(ah, dm)]);
  }
  dashRows.push([]);
  dashRows.push(['TOTAL', '', totalIng, '', totalAh]);

  // Cartera
  dashRows.push([], ['MI CARTERA'], ['Concepto', 'En Peso$', 'En U$D']);
  if (portfolio) {
    for (const [, item] of Object.entries(portfolio.liquidez || {})) {
      const monto = Number(item.monto) || 0;
      dashRows.push([item.label, item.moneda === 'USD' ? monto * dolarGlobal : monto, item.moneda === 'USD' ? monto : monto / (dolarGlobal || 1)]);
    }
    for (const [, item] of Object.entries(portfolio.inversiones || {})) {
      const monto = Number(item.monto) || 0;
      dashRows.push([item.label, monto, monto / (dolarGlobal || 1)]);
    }
  }

  const wsDash = XLSX.utils.aoa_to_sheet(dashRows);
  XLSX.utils.book_append_sheet(wb, wsDash, 'Dashboard');

  // --- Hojas mensuales ---
  for (let i = 0; i < MESES.length; i++) {
    const m = await dbGet('months', mesKey(MESES[i], año));
    if (!m) continue;

    const rows = [
      [`${MESES_LABEL[i]} ${año}`],
      [],
      ['EGRESOS'],
      ['', 'Categoría', 'Descripción', '', 'Proyectado', 'Real'],
    ];

    for (const cat of CATEGORIAS_EGRESO) {
      const catData = m.egresos?.[cat.id];
      rows.push(['', cat.nombre.toUpperCase()]);
      if (catData?.items) {
        catData.items.forEach((item) => {
          rows.push(['', '', item.descripcion, '', item.proyectado || 0, item.real || 0]);
        });
      }
      const subP = calcSubtotalCategoria(catData, 'proyectado');
      const subR = calcSubtotalCategoria(catData, 'real');
      rows.push(['', '', `SUBTOTAL ${cat.nombre}`, '', subP, subR]);
    }

    const totalEgP = calcTotalEgresos(m.egresos, 'proyectado');
    const totalEgR = calcTotalEgresos(m.egresos, 'real');
    rows.push([], ['', '', 'TOTAL EGRESOS', '', totalEgP, totalEgR]);

    const totalInvP = calcTotalMovimientosCapital(m.egresos, 'proyectado');
    const totalInvR = calcTotalMovimientosCapital(m.egresos, 'real');
    rows.push([], ['', '', 'TOTAL INVERSIÓN / MOVIMIENTO DE CAPITAL', '', totalInvP, totalInvR]);

    rows.push([], [], ['INGRESOS'], ['', '', '', '', '', '', '', '', 'Descripción', 'Proyectado', 'Real', 'Hs Sem.', 'Hs Mens.']);
    if (m.ingresos) {
      m.ingresos.forEach(item => {
        rows.push(['', '', '', '', '', '', '', '', item.descripcion, item.proyectado || 0, item.real || 0, item.horasSemanales || '', item.horasMensuales || '']);
      });
    }
    rows.push(['', '', '', '', '', '', '', '', 'TOTAL', calcTotalIngresos(m.ingresos, 'proyectado'), calcTotalIngresos(m.ingresos, 'real')]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `${MESES_LABEL[i]} ${año}`);
  }

  // Download
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `MisCuentas_${año}.xlsx`);
}

// ─── EXPORT PDF ──────────────────────────────────────────
/**
 * Genera un PDF del mes seleccionado usando window.print() con CSS de impresión.
 */
export async function exportToPDF(mesId) {
  const config = await dbGet('config', 'global');
  const año = config?.año || 2026;
  const monthKey = mesKey(mesId, año);
  const m = await dbGet('months', monthKey);
  if (!m) return;
  const dolarMes = await getDolarCCL(monthKey);
  const mesIdx = MESES.indexOf(mesId);
  const mesLabel = MESES_LABEL[mesIdx] || mesId;

  const totalIngP = calcTotalIngresos(m.ingresos, 'proyectado');
  const totalIngR = calcTotalIngresos(m.ingresos, 'real');
  const totalEgP = calcTotalEgresos(m.egresos, 'proyectado');
  const totalEgR = calcTotalEgresos(m.egresos, 'real');
  const totalInvP = calcTotalMovimientosCapital(m.egresos, 'proyectado');
  const totalInvR = calcTotalMovimientosCapital(m.egresos, 'real');

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Mis Cuentas - ${mesLabel} ${año}</title>
  <style>body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:20px}
  h1{font-size:18px;margin-bottom:4px}h2{font-size:14px;margin:12px 0 4px;border-bottom:1px solid #ccc;padding-bottom:2px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{padding:3px 6px;border:1px solid #ddd;text-align:left}
  th{background:#f5f5f5;font-weight:600}.r{text-align:right}.total{font-weight:700;background:#eef}
  .pos{color:green}.neg{color:red}</style></head><body>`;

  html += `<h1>Mis Cuentas — ${mesLabel} ${año}</h1>`;

  // Ingresos
  html += `<h2>INGRESOS</h2><table><tr><th>Descripción</th><th class="r">Proyectado</th><th class="r">Real</th><th>Hs Sem.</th><th>Hs Mens.</th></tr>`;
  (m.ingresos || []).forEach(item => {
    html += `<tr><td>${item.descripcion}</td><td class="r">$${(item.proyectado||0).toLocaleString('es-AR')}</td><td class="r">$${(item.real||0).toLocaleString('es-AR')}</td><td>${item.horasSemanales||''}</td><td>${item.horasMensuales||''}</td></tr>`;
  });
  html += `<tr class="total"><td>TOTAL</td><td class="r">$${totalIngP.toLocaleString('es-AR')}</td><td class="r">$${totalIngR.toLocaleString('es-AR')}</td><td></td><td></td></tr></table>`;

  // Egresos
  html += `<h2>EGRESOS</h2>`;
  for (const cat of CATEGORIAS_EGRESO) {
    const catData = m.egresos?.[cat.id];
    if (!catData?.items?.length) continue;
    html += `<h3 style="font-size:12px;margin:8px 0 2px">${cat.icon} ${cat.nombre}</h3><table><tr><th>Descripción</th><th class="r">Proyectado</th><th class="r">Real</th></tr>`;
    catData.items.forEach(item => {
      html += `<tr><td>${item.descripcion}</td><td class="r">$${(item.proyectado||0).toLocaleString('es-AR')}</td><td class="r">$${(item.real||0).toLocaleString('es-AR')}</td></tr>`;
    });
    html += `<tr class="total"><td>Subtotal</td><td class="r">$${calcSubtotalCategoria(catData,'proyectado').toLocaleString('es-AR')}</td><td class="r">$${calcSubtotalCategoria(catData,'real').toLocaleString('es-AR')}</td></tr></table>`;
  }
  html += `<table><tr class="total"><td>TOTAL EGRESOS</td><td class="r">$${totalEgP.toLocaleString('es-AR')}</td><td class="r">$${totalEgR.toLocaleString('es-AR')}</td></tr></table>`;

  // Resultado
  const restP = totalIngP - totalEgP;
  const restR = totalIngR - totalEgR;
  html += `<h2>RESULTADO</h2><table>
    <tr><td>Ingresos</td><td class="r">$${totalIngP.toLocaleString('es-AR')}</td><td class="r">$${totalIngR.toLocaleString('es-AR')}</td></tr>
    <tr><td>Egresos</td><td class="r">$${totalEgP.toLocaleString('es-AR')}</td><td class="r">$${totalEgR.toLocaleString('es-AR')}</td></tr>
    <tr><td>💰 Inversión / Movimiento de Capital</td><td class="r">$${totalInvP.toLocaleString('es-AR')}</td><td class="r">$${totalInvR.toLocaleString('es-AR')}</td></tr>
    <tr class="total"><td>Restante</td><td class="r ${restP>=0?'pos':'neg'}">$${restP.toLocaleString('es-AR')}</td><td class="r ${restR>=0?'pos':'neg'}">$${restR.toLocaleString('es-AR')}</td></tr>
  </table>`;

  html += `<p style="color:#999;font-size:9px;margin-top:16px">Generado por Mis Cuentas · ${new Date().toLocaleString('es-AR')}</p></body></html>`;

  // Open print window
  const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

// ─── Helper ──────────────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
