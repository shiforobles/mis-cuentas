/**
 * Dashboard Tab 1 — INGRESOS
 * Tabla mensual, gráfico barras ingresos, línea dólar, línea ahorros.
 */
import { allMonths, configData, dolarCCL, chartInstances, getChartDefaults, renderDollarWidget } from './dashboard.js';
import { calcTotalIngresos, calcTotalEgresos, calcIngresosUSD, calcTotalAnual } from '../services/calculations.js';
import { formatARS, formatUSD, formatDolar } from '../utils/format.js';
import { MESES_SHORT } from '../utils/constants.js';
import { navigate } from '../router.js';

export function renderTabIngresos(panel) {
  const anual = calcTotalAnual(allMonths, 'proyectado', dolarCCL);

  panel.innerHTML = `
    <div id="dollar-widget" class="section"></div>
    <div class="card section">
      <h2 class="card__title"><span class="card__title-icon">📋</span> Ingresos Mensuales</h2>
      <div class="annual-table-wrap">
        <table class="data-table annual-table">
          <thead><tr>
            <th>Mes</th><th class="text-right">Dólar</th><th class="text-right">Ingresos $</th>
            <th class="text-right">Ingresos USD</th><th class="text-right">Ahorro $</th><th class="text-right">Ahorro USD</th>
          </tr></thead>
          <tbody>
            ${allMonths.map((m, i) => {
              if (!m) return '';
              const ing = calcTotalIngresos(m.ingresos, 'proyectado');
              const eg = calcTotalEgresos(m.egresos, 'proyectado');
              const dm = m.dolarCCL || dolarCCL;
              const ingUSD = calcIngresosUSD(ing, dm);
              const ahorro = ing - eg;
              const ahUSD = calcIngresosUSD(ahorro, dm);
              return `<tr style="cursor:pointer" data-mes="${i}">
                <td style="font-weight:600">${MESES_SHORT[i]}</td>
                <td class="text-right text-muted">${formatDolar(dm)}</td>
                <td class="text-right">${formatARS(ing)}</td>
                <td class="text-right" style="color:var(--color-info-text)">${formatUSD(ingUSD)}</td>
                <td class="text-right ${ahorro >= 0 ? 'text-success' : 'text-danger'}">${formatARS(ahorro)}</td>
                <td class="text-right ${ahUSD >= 0 ? 'text-success' : 'text-danger'}">${formatUSD(ahUSD)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="data-table--total">
              <td><strong>TOTAL</strong></td><td></td>
              <td class="text-right"><strong>${formatARS(anual.totalARS)}</strong></td>
              <td class="text-right" style="color:var(--color-info-text)"><strong>${formatUSD(anual.totalUSD)}</strong></td>
              <td></td><td></td>
            </tr>
            <tr style="font-size:var(--font-size-xs);color:var(--color-text-secondary)">
              <td>Promedio</td><td></td>
              <td class="text-right">${formatARS(anual.promedioARS)}</td>
              <td class="text-right">${formatUSD(anual.promedioUSD)}</td>
              <td colspan="2" class="text-right">${anual.mesesConDatos} mes${anual.mesesConDatos !== 1 ? 'es' : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="section"><div class="card"><h3 class="card__title"><span class="card__title-icon">💰</span> Ingresos Mensuales</h3><div class="chart-container"><canvas id="chart-ingresos"></canvas></div></div></div>
      <div class="section"><div class="card"><h3 class="card__title"><span class="card__title-icon">📈</span> Dólar CCL</h3><div class="chart-container"><canvas id="chart-dolar"></canvas></div></div></div>
      <div class="section dashboard-grid__full"><div class="card"><h3 class="card__title"><span class="card__title-icon">🏦</span> Ahorro Mensual</h3><div class="chart-container"><canvas id="chart-ahorro"></canvas></div></div></div>
    </div>
  `;

  renderDollarWidget(document.getElementById('dollar-widget'));

  // Row click → navigate to month
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  panel.querySelectorAll('tr[data-mes]').forEach(tr => {
    tr.addEventListener('click', () => navigate('mes', meses[parseInt(tr.dataset.mes)]));
  });

  // Charts
  import('chart.js').then(({ Chart, registerables }) => {
    Chart.register(...registerables);
    const { fontColor, gridColor, colors, options } = getChartDefaults();
    const scaleOpts = { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } };

    // Bar: Ingresos
    const ctx1 = document.getElementById('chart-ingresos')?.getContext('2d');
    if (ctx1) {
      chartInstances.ingresos = new Chart(ctx1, {
        type: 'bar',
        data: { labels: MESES_SHORT, datasets: [{ label: 'Ingresos $', data: allMonths.map(m => m ? calcTotalIngresos(m.ingresos, 'proyectado') : 0), backgroundColor: colors[0] + '99', borderColor: colors[0], borderWidth: 1, borderRadius: 6 }] },
        options: { ...options, scales: scaleOpts }
      });
    }

    // Line: Dólar
    const ctx2 = document.getElementById('chart-dolar')?.getContext('2d');
    if (ctx2) {
      chartInstances.dolar = new Chart(ctx2, {
        type: 'line',
        data: { labels: MESES_SHORT, datasets: [{ label: 'Dólar CCL', data: allMonths.map(m => m?.dolarCCL || dolarCCL), borderColor: colors[1], backgroundColor: 'rgba(34,211,238,0.1)', fill: true, tension: 0.3, pointRadius: 4 }] },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { color: gridColor } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }

    // Line: Ahorro
    const ctx3 = document.getElementById('chart-ahorro')?.getContext('2d');
    if (ctx3) {
      const ahorroData = allMonths.map(m => {
        if (!m) return 0;
        return calcTotalIngresos(m.ingresos, 'proyectado') - calcTotalEgresos(m.egresos, 'proyectado');
      });
      chartInstances.ahorro = new Chart(ctx3, {
        type: 'line',
        data: { labels: MESES_SHORT, datasets: [{ label: 'Ahorro $', data: ahorroData, borderColor: colors[2], backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, pointRadius: 4 }] },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }
  }).catch(e => console.error('Chart.js error:', e));
}
