/**
 * Dashboard Tab 3 — GASTOS
 * Análisis de gastos: dona por categoría, ideal vs real, top gastos, tendencias.
 */
import { allMonths, dolarCCL, chartInstances, getChartDefaults, configData } from './dashboard.js';
import { calcTotalEgresos, calcSubtotalCategoria, calcDistribucionIdeal, calcTopGastos, calcTendenciaGastos } from '../services/calculations.js';
import { formatARS, formatPercent } from '../utils/format.js';
import { MESES, MESES_SHORT, CATEGORIAS_EGRESO, ROUTES } from '../utils/constants.js';
import { $ } from '../utils/helpers.js';
import { navigate } from '../router.js';

export function renderTabGastos(panel) {
  const mesActualIdx = new Date().getMonth();

  panel.innerHTML = `
    <div class="card section" style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
      <label style="font-weight:600;font-size:var(--font-size-sm)">Mes:</label>
      <select id="gastos-mes-select" class="form-field__input" style="width:auto;padding:var(--space-2) var(--space-3)">
        ${MESES.map((m, i) => `<option value="${i}" ${i === mesActualIdx ? 'selected' : ''}>${MESES_SHORT[i]}</option>`).join('')}
      </select>
      <button class="btn btn--secondary btn--sm" id="btn-compare-months" style="margin-left:auto">📊 Comparar meses</button>
    </div>
    <div id="gastos-content"></div>
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📉</span> Tendencia por Categoría (año)</h3>
      <div class="chart-container" style="height:300px"><canvas id="chart-tendencia"></canvas></div>
    </div>
  `;

  const renderMonth = (idx) => {
    const m = allMonths[idx];
    const container = $('#gastos-content');
    if (!container) return;
    if (!m) { container.innerHTML = '<div class="empty-state"><div class="empty-state__text">Sin datos para este mes</div></div>'; return; }

    const dist = calcDistribucionIdeal(m.egresos, configData?.distribucionIdeal || {}, 'real');
    const topG = calcTopGastos(m.egresos, 5, CATEGORIAS_EGRESO);
    const totalEg = calcTotalEgresos(m.egresos, 'real');

    // Alerts
    const alertas = dist.filter(d => d.semaforo === 'danger');

    container.innerHTML = `
      ${alertas.length > 0 ? `<div class="card section" style="border-color:var(--color-danger);background:var(--color-danger-subtle)">
        <div style="font-weight:600;color:var(--color-danger-text);margin-bottom:var(--space-2)">⚠️ Categorías excedidas</div>
        ${alertas.map(a => `<div style="font-size:var(--font-size-sm)">• <strong>${a.nombre}</strong>: ${formatPercent(a.percentActual)} (ideal: ${formatPercent(a.percentIdeal)})</div>`).join('')}
      </div>` : ''}

      <div class="dashboard-grid">
        <div class="section"><div class="card">
          <h3 class="card__title"><span class="card__title-icon">🍩</span> Gastos por Categoría</h3>
          <div class="chart-container"><canvas id="chart-gastos-cat"></canvas></div>
        </div></div>
        <div class="section"><div class="card">
          <h3 class="card__title"><span class="card__title-icon">🔥</span> Top Gastos</h3>
          ${topG.length > 0 ? `<div class="top-gastos-list">
            ${topG.map((g, i) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;${i < topG.length - 1 ? 'border-bottom:1px solid var(--color-border)' : ''}">
              <div><span style="margin-right:var(--space-2)">${g.catIcon}</span><strong>${g.descripcion}</strong><br><span class="text-muted" style="font-size:var(--font-size-xs)">${g.catNombre}</span></div>
              <div style="font-weight:700;white-space:nowrap">${formatARS(g.real)}</div>
            </div>`).join('')}
          </div>` : '<div class="empty-state"><div class="empty-state__text">Sin gastos reales</div></div>'}
        </div></div>
      </div>

      <div class="card section">
        <h3 class="card__title"><span class="card__title-icon">🎯</span> Distribución Ideal vs Real</h3>
        <div class="annual-table-wrap">
          <table class="data-table"><thead><tr>
            <th>Categoría</th><th class="text-right">% Ideal</th><th class="text-right">Monto Real</th><th class="text-right">% Real</th><th>Estado</th>
          </tr></thead><tbody>
            ${dist.map(d => {
              const sColor = d.semaforo === 'ok' ? 'var(--color-success)' : d.semaforo === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
              return `<tr>
                <td style="font-weight:500">${d.nombre}</td>
                <td class="text-right text-muted">${formatPercent(d.percentIdeal)}</td>
                <td class="text-right">${formatARS(d.montoReal)}</td>
                <td class="text-right" style="font-weight:600">${formatPercent(d.percentActual)}</td>
                <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${sColor}"></span></td>
              </tr>`;
            }).join('')}
          </tbody></table>
        </div>
      </div>
    `;

    // Dona gastos por categoría
    import('chart.js').then(({ Chart, registerables }) => {
      Chart.register(...registerables);
      const { colors, options } = getChartDefaults();
      const labels = [], vals = [];
      CATEGORIAS_EGRESO.forEach(cat => {
        const sub = calcSubtotalCategoria(m.egresos[cat.id], 'real');
        if (sub > 0) { labels.push(cat.icon + ' ' + cat.nombre); vals.push(sub); }
      });
      const ctx = document.getElementById('chart-gastos-cat')?.getContext('2d');
      if (ctx && labels.length) {
        if (chartInstances.gastosCat) chartInstances.gastosCat.destroy();
        chartInstances.gastosCat = new Chart(ctx, {
          type: 'doughnut',
          data: { labels, datasets: [{ data: vals, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, cutout: '55%' }] },
          options: { ...options, plugins: { ...options.plugins, legend: { position: 'bottom', labels: { ...options.plugins.legend.labels, padding: 8, font: { size: 10 } } } } }
        });
      }
    });
  };

  renderMonth(mesActualIdx);

  // Month selector
  $('#gastos-mes-select')?.addEventListener('change', (e) => {
    renderMonth(parseInt(e.target.value));
  });

  // Compare button (F3)
  $('#btn-compare-months')?.addEventListener('click', () => {
    navigate(ROUTES.COMPARE);
  });

  // Tendencia anual
  import('chart.js').then(({ Chart, registerables }) => {
    Chart.register(...registerables);
    const { fontColor, gridColor, colors, options } = getChartDefaults();
    const tendencia = calcTendenciaGastos(allMonths, 'real');
    const datasets = [];
    CATEGORIAS_EGRESO.forEach((cat, i) => {
      const data = tendencia[cat.id];
      if (data && data.some(v => v > 0)) {
        datasets.push({ label: cat.nombre, data, borderColor: colors[i % colors.length], backgroundColor: 'transparent', tension: 0.3, pointRadius: 3, borderWidth: 2 });
      }
    });
    const ctx = document.getElementById('chart-tendencia')?.getContext('2d');
    if (ctx && datasets.length) {
      chartInstances.tendencia = new Chart(ctx, {
        type: 'line',
        data: { labels: MESES_SHORT, datasets },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }
  });
}
