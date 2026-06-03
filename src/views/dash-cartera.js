/**
 * Dashboard Tab 2 — CARTERA / INVERSIONES
 * Tabla cartera desglosada + torta total + dona inversiones.
 */
import { portfolioData, dolarCCL, chartInstances, getChartDefaults, allMonths } from './dashboard.js';
import { calcCartera, calcRebalanceo, calcFondoEmergencia } from '../services/calculations.js';
import { formatARS, formatUSD, formatPercent } from '../utils/format.js';

export function renderTabCartera(panel) {
  if (!portfolioData) {
    panel.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-state__icon">💼</div><div class="empty-state__text">Cargá tu cartera desde Configuración</div></div></div>';
    return;
  }
  const c = calcCartera(portfolioData, dolarCCL);
  if (!c) return;

  const reb = calcRebalanceo(c.totals, portfolioData.targets, dolarCCL);
  const fe = calcFondoEmergencia(portfolioData, allMonths, dolarCCL);

  panel.innerHTML = `
    <div class="card section">
      <div class="portfolio-total">
        <span class="portfolio-total__label">GRAN TOTAL</span>
        <span class="portfolio-total__ars">${formatARS(c.totals.granTotalARS)}</span>
        <span class="portfolio-total__usd">${formatUSD(c.totals.granTotalUSD)}</span>
      </div>
    </div>

    ${buildEmergenciaCard(fe)}

    ${buildRebalanceCard(reb)}

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">💧</span> Liquidez — ${formatARS(c.totals.liquidezARS)} / ${formatUSD(c.totals.liquidezUSD)}</h3>
      <table class="data-table"><thead><tr>
        <th>Concepto</th><th class="text-right">Monto</th><th class="text-right">En USD</th><th class="text-right">%</th>
      </tr></thead><tbody>
        ${Object.entries(c.liquidez).map(([k, item]) => `<tr>
          <td>${item.label}${item.detalle ? ` <span class="text-muted" style="font-size:var(--font-size-xs)">(${item.detalle})</span>` : ''}</td>
          <td class="text-right">${item.moneda === 'USD' ? formatUSD(item.montoOriginal) : formatARS(item.ars)}</td>
          <td class="text-right" style="color:var(--color-info-text)">${formatUSD(item.usd)}</td>
          <td class="text-right text-muted">${formatPercent(item.percentTotal)}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📊</span> Inversiones — ${formatARS(c.totals.inversionesARS)} / ${formatUSD(c.totals.inversionesUSD)}</h3>
      <table class="data-table"><thead><tr>
        <th>Concepto</th><th class="text-right">ARS</th><th class="text-right">USD</th><th class="text-right">% Total</th><th class="text-right">% Inv.</th>
      </tr></thead><tbody>
        ${Object.entries(c.inversiones).map(([k, item]) => `<tr>
          <td>${item.label}</td>
          <td class="text-right">${formatARS(item.ars)}</td>
          <td class="text-right" style="color:var(--color-info-text)">${formatUSD(item.usd)}</td>
          <td class="text-right text-muted">${formatPercent(item.percentTotal)}</td>
          <td class="text-right">${formatPercent(item.percentInversiones)}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>

    <div class="dashboard-grid">
      <div class="section"><div class="card"><h3 class="card__title"><span class="card__title-icon">🍩</span> Cartera Total</h3><div class="chart-container"><canvas id="chart-cartera-pie"></canvas></div></div></div>
      <div class="section"><div class="card"><h3 class="card__title"><span class="card__title-icon">📊</span> Inversiones</h3><div class="chart-container"><canvas id="chart-inv-dona"></canvas></div></div></div>
    </div>
  `;

  // Charts
  import('chart.js').then(({ Chart, registerables }) => {
    Chart.register(...registerables);
    const { colors, options } = getChartDefaults();

    const labels1 = [], vals1 = [];
    Object.values(c.liquidez).forEach(i => { if (i.ars > 0) { labels1.push(i.label); vals1.push(i.ars); } });
    Object.values(c.inversiones).forEach(i => { if (i.ars > 0) { labels1.push(i.label); vals1.push(i.ars); } });

    const ctx1 = document.getElementById('chart-cartera-pie')?.getContext('2d');
    if (ctx1 && labels1.length) {
      chartInstances.carteraPie = new Chart(ctx1, {
        type: 'pie',
        data: { labels: labels1, datasets: [{ data: vals1, backgroundColor: colors.slice(0, labels1.length), borderWidth: 0 }] },
        options: { ...options, plugins: { ...options.plugins, legend: { position: 'bottom', labels: { ...options.plugins.legend.labels, padding: 12 } } } }
      });
    }

    const labels2 = [], vals2 = [];
    Object.values(c.inversiones).forEach(i => { if (i.ars > 0) { labels2.push(i.label); vals2.push(i.ars); } });
    const ctx2 = document.getElementById('chart-inv-dona')?.getContext('2d');
    if (ctx2 && labels2.length) {
      chartInstances.invDona = new Chart(ctx2, {
        type: 'doughnut',
        data: { labels: labels2, datasets: [{ data: vals2, backgroundColor: [colors[0], colors[3], colors[5]], borderWidth: 0, cutout: '60%' }] },
        options: { ...options, plugins: { ...options.plugins, legend: { position: 'bottom', labels: { ...options.plugins.legend.labels, padding: 12 } } } }
      });
    }
  }).catch(e => console.error('Chart.js error:', e));
}

/**
 * Construye la tarjeta del Fondo de emergencia (meses de gasto cubiertos).
 * @param {object|null} fe - resultado de calcFondoEmergencia
 * @returns {string} HTML
 */
function buildEmergenciaCard(fe) {
  const titulo = `<h3 class="card__title"><span class="card__title-icon">🛡️</span> Fondo de emergencia</h3>`;

  if (!fe || fe.configurado === false) {
    return `
      <div class="card section">
        ${titulo}
        <div class="text-muted" style="font-size:var(--font-size-sm)">Elegí qué concepto es tu fondo de emergencia en Configuración para ver cuántos meses de gastos cubre.</div>
      </div>`;
  }

  const okColor = 'var(--color-success-text, #16a34a)';
  const warnColor = 'var(--color-warning-text, #d97706)';

  // Sin datos de gasto todavía.
  if (fe.mesesCubiertos == null) {
    return `
      <div class="card section">
        ${titulo}
        <div style="font-size:var(--font-size-sm);margin-bottom:var(--space-1)"><strong>${fe.label}</strong>: ${formatARS(fe.fondoARS)} <span class="text-muted">(${formatUSD(fe.fondoUSD)})</span></div>
        <div class="text-muted" style="font-size:var(--font-size-xs)">Cargá gastos en tus meses para calcular cuántos meses cubre.</div>
      </div>`;
  }

  const meses = fe.mesesCubiertos;
  const mesesTxt = meses.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pctMeta = Math.min(100, (meses / fe.objetivoMeses) * 100);
  const color = fe.alcanza ? okColor : warnColor;
  const estado = fe.alcanza
    ? `Cubierto (objetivo ${fe.objetivoMeses} meses) ✓`
    : `Por debajo del objetivo de ${fe.objetivoMeses} meses`;

  const alerta = !fe.alcanza ? `
    <div style="margin-top:var(--space-2);padding:var(--space-2) var(--space-3);border-radius:var(--radius-sm);background:var(--color-warning-bg, rgba(217,119,6,.12));border:1px solid ${warnColor};font-size:var(--font-size-xs);color:var(--color-text-secondary)">
      Para llegar a ${fe.objetivoMeses} meses te falta sumar <strong>${formatARS(fe.faltanteARS)}</strong> al fondo.
    </div>` : '';

  return `
    <div class="card section">
      ${titulo}
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:var(--space-1)">
        <span style="font-size:var(--font-size-xl, 1.5rem);font-weight:700;color:${color}">${mesesTxt} meses</span>
        <span style="font-size:var(--font-size-sm)" class="text-muted">${formatARS(fe.fondoARS)}</span>
      </div>
      <div style="position:relative;height:8px;background:var(--color-bg-tertiary, rgba(255,255,255,.08));border-radius:999px;overflow:hidden;margin-bottom:var(--space-2)">
        <div style="position:absolute;inset:0 auto 0 0;width:${pctMeta}%;background:${color};border-radius:999px"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:var(--font-size-xs)">
        <span style="color:${color};font-weight:600">${estado}</span>
        <span class="text-muted">Gasto ${fe.gastoModo}: ${formatARS(fe.gastoMensualARS)}/mes</span>
      </div>
      ${alerta}
    </div>`;
}

/**
 * Construye la tarjeta de Asignación objetivo + alerta de rebalanceo.
 * @param {object|null} reb - resultado de calcRebalanceo
 * @returns {string} HTML
 */
function buildRebalanceCard(reb) {
  if (!reb) {
    return `
      <div class="card section">
        <h3 class="card__title"><span class="card__title-icon">🎯</span> Asignación objetivo</h3>
        <div class="text-muted" style="font-size:var(--font-size-sm)">Cargá montos en tu cartera para ver el rebalanceo.</div>
      </div>`;
  }

  return `
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🎯</span> Asignación objetivo</h3>
      ${buildRebalanceDim('Bloques', reb.bloque)}
      <div style="height:var(--space-3)"></div>
      ${buildRebalanceDim('Moneda', reb.moneda)}
    </div>`;
}

/** Renderiza una dimensión (bloques o moneda) con sus dos lados, barra y alerta. */
function buildRebalanceDim(titulo, dim) {
  const dev = Math.round(Math.abs(dim.devPp));
  const okColor = 'var(--color-success-text, #16a34a)';
  const warnColor = 'var(--color-warning-text, #d97706)';
  const estadoColor = dim.alerta ? warnColor : okColor;
  const estadoTxt = dim.alerta ? `${dev} pp fuera` : 'En objetivo';

  const sideRow = (s) => {
    const cur = Math.round(s.curPct);
    const tgt = Math.round(s.tgtPct);
    return `
      <div style="margin-bottom:var(--space-2)">
        <div style="display:flex;justify-content:space-between;font-size:var(--font-size-sm);margin-bottom:4px">
          <span>${s.label}</span>
          <span><strong>${cur}%</strong> <span class="text-muted">/ obj ${tgt}%</span></span>
        </div>
        <div style="position:relative;height:6px;background:var(--color-bg-tertiary, rgba(255,255,255,.08));border-radius:999px;overflow:hidden">
          <div style="position:absolute;inset:0 auto 0 0;width:${Math.min(100, cur)}%;background:var(--color-info-text, #3b82f6);border-radius:999px"></div>
          <div style="position:absolute;top:-2px;bottom:-2px;left:${Math.min(100, tgt)}%;width:2px;background:var(--color-text-secondary)"></div>
        </div>
      </div>`;
  };

  const alerta = dim.alerta ? `
    <div style="margin-top:var(--space-2);padding:var(--space-2) var(--space-3);border-radius:var(--radius-sm);background:var(--color-warning-bg, rgba(217,119,6,.12));border:1px solid ${warnColor};font-size:var(--font-size-xs);color:var(--color-text-secondary)">
      Tenés exceso en <strong>${dim.origen}</strong>. Para volver al objetivo, mové
      <strong>${formatARS(dim.ajusteARS)}</strong> (${formatUSD(dim.ajusteUSD)})
      de <strong>${dim.origen}</strong> a <strong>${dim.destino}</strong>.
    </div>` : '';

  return `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)">
        <span style="font-size:var(--font-size-xs);font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-tertiary)">${titulo}</span>
        <span style="font-size:var(--font-size-xs);font-weight:600;color:${estadoColor}">${estadoTxt}</span>
      </div>
      ${sideRow(dim.a)}
      ${sideRow(dim.b)}
      ${alerta}
    </div>`;
}
