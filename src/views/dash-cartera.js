/**
 * Dashboard Tab 2 — CARTERA / INVERSIONES
 * Tabla cartera desglosada + torta total + dona inversiones.
 */
import { portfolioData, dolarCCL, chartInstances, getChartDefaults } from './dashboard.js';
import { calcCartera } from '../services/calculations.js';
import { formatARS, formatUSD, formatPercent } from '../utils/format.js';

export function renderTabCartera(panel) {
  if (!portfolioData) {
    panel.innerHTML = '<div class="card"><div class="empty-state"><div class="empty-state__icon">💼</div><div class="empty-state__text">Cargá tu cartera desde Configuración</div></div></div>';
    return;
  }
  const c = calcCartera(portfolioData, dolarCCL);
  if (!c) return;

  panel.innerHTML = `
    <div class="card section">
      <div class="portfolio-total">
        <span class="portfolio-total__label">GRAN TOTAL</span>
        <span class="portfolio-total__ars">${formatARS(c.totals.granTotalARS)}</span>
        <span class="portfolio-total__usd">${formatUSD(c.totals.granTotalUSD)}</span>
      </div>
    </div>

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
