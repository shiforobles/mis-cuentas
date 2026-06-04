/**
 * Dashboard Tab 4 — PATRIMONIO / AHORRO
 * Evolución patrimonial, ahorro acumulado, proyección de fin de año,
 * y evolución de cartera (F4).
 */
import { allMonths, dolarCCL, chartInstances, getChartDefaults, configData } from './dashboard.js';
import { calcAhorroAcumulado, calcProyeccionAnual } from '../services/calculations.js';
import { getPortfolioHistoryByYear, calcPortfolioEvolution, deletePortfolioSnapshot } from '../services/portfolio-history.js';
import { formatARS, formatUSD, formatPercent } from '../utils/format.js';
import { MESES_SHORT } from '../utils/constants.js';
import { showToast } from '../utils/helpers.js';

export async function renderTabPatrimonio(panel) {
  const ahorro = calcAhorroAcumulado(allMonths, 'real', dolarCCL);
  const proy = calcProyeccionAnual(allMonths, 'real', dolarCCL);
  const acumuladoActual = ahorro.length > 0 ? ahorro[ahorro.length - 1].acumulado : 0;
  const acumuladoUSD = ahorro.length > 0 ? ahorro[ahorro.length - 1].acumuladoUSD : 0;
  const año = configData?.año || 2026;

  // F4: Load portfolio evolution
  const snapshots = await getPortfolioHistoryByYear(año);
  const evolution = calcPortfolioEvolution(snapshots);

  panel.innerHTML = `
    <div class="dashboard-grid">
      <div class="section"><div class="card card--accent">
        <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-1)">AHORRO ACUMULADO ${año}</div>
        <div style="font-size:var(--font-size-2xl);font-weight:800;color:${acumuladoActual >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${formatARS(acumuladoActual)}</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-info-text);margin-top:2px">${formatUSD(acumuladoUSD)}</div>
      </div></div>

      <div class="section"><div class="card card--accent">
        <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-1)">PROYECCIÓN FIN DE AÑO</div>
        <div style="font-size:var(--font-size-2xl);font-weight:800;color:${proy.proyectado12 >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${formatARS(proy.proyectado12)}</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-info-text);margin-top:2px">${formatUSD(proy.proyectadoUSD)}</div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Promedio mensual: ${formatARS(proy.promedioMensual)} · ${proy.mesesConDatos} meses con datos</div>
      </div></div>
    </div>

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📈</span> Ahorro Acumulado</h3>
      <div class="chart-container" style="height:300px"><canvas id="chart-ahorro-acum"></canvas></div>
    </div>

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">💰</span> Ahorro Mensual</h3>
      <div class="chart-container" style="height:250px"><canvas id="chart-ahorro-mensual"></canvas></div>
    </div>

    <!-- F4: Evolución de Cartera -->
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📊</span> Evolución de Cartera</h3>
      ${snapshots.length > 0 ? `
        <div class="chart-container" style="height:300px"><canvas id="chart-cartera-evol"></canvas></div>
        <div class="annual-table-wrap" style="margin-top:var(--space-4)">
          <table class="data-table">
            <thead><tr>
              <th>Mes</th>
              <th class="text-right">Total ARS</th>
              <th class="text-right">Total USD</th>
              <th class="text-right">Δ ARS</th>
              <th class="text-right">Δ %</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${evolution.map(e => {
                const deltaColor = e.deltaARS >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
                const arrow = e.deltaARS > 0 ? '▲' : e.deltaARS < 0 ? '▼' : '—';
                const mesCap = e.mesId.charAt(0).toUpperCase() + e.mesId.slice(1);
                return `<tr>
                  <td style="font-weight:600">${mesCap}</td>
                  <td class="text-right" style="font-weight:600">${formatARS(e.granTotalARS)}</td>
                  <td class="text-right" style="color:var(--color-info-text)">${formatUSD(e.granTotalUSD)}</td>
                  <td class="text-right" style="color:${deltaColor}">${arrow} ${formatARS(Math.abs(e.deltaARS))}</td>
                  <td class="text-right" style="color:${deltaColor}">${e.deltaPercent !== 0 ? formatPercent(e.deltaPercent) : '—'}</td>
                  <td class="text-right"><button class="row-delete btn-del-snap" data-id="${e.id}" data-mes="${mesCap}" title="Borrar snapshot">✕</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="empty-state" style="padding:var(--space-6) 0">
          <div class="empty-state__icon">📸</div>
          <div class="empty-state__text">No hay snapshots de cartera.</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Guardá tu primer snapshot desde Configuración → 📸</div>
        </div>
      `}
    </div>

    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">📋</span> Detalle Ahorro por Mes</h3>
      <div class="annual-table-wrap">
        <table class="data-table"><thead><tr>
          <th>Mes</th><th class="text-right">Ahorro del mes</th><th class="text-right">Acumulado ARS</th><th class="text-right">Acumulado USD</th>
        </tr></thead><tbody>
          ${ahorro.map((a, i) => `<tr>
            <td style="font-weight:600">${MESES_SHORT[i]}</td>
            <td class="text-right ${a.ahorroMes >= 0 ? 'text-success' : 'text-danger'}">${formatARS(a.ahorroMes)}</td>
            <td class="text-right" style="font-weight:600">${formatARS(a.acumulado)}</td>
            <td class="text-right" style="color:var(--color-info-text)">${formatUSD(a.acumuladoUSD)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>
    </div>
  `;

  // Borrar un snapshot puntual (con confirmación) y re-renderizar la pestaña.
  panel.querySelectorAll('.btn-del-snap').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { id, mes } = btn.dataset;
      if (!confirm(`¿Borrar el snapshot de ${mes}? Esta acción no se puede deshacer.`)) return;
      try {
        await deletePortfolioSnapshot(id);
        showToast(`Snapshot de ${mes} borrado`, 'success');
        Object.values(chartInstances).forEach(c => c?.destroy?.());
        renderTabPatrimonio(panel);
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    });
  });

  // Charts
  import('chart.js').then(({ Chart, registerables }) => {
    Chart.register(...registerables);
    const { fontColor, gridColor, colors, options } = getChartDefaults();

    // Acumulado
    const ctx1 = document.getElementById('chart-ahorro-acum')?.getContext('2d');
    if (ctx1) {
      chartInstances.ahorroAcum = new Chart(ctx1, {
        type: 'line',
        data: { labels: MESES_SHORT, datasets: [
          { label: 'Acumulado ARS', data: ahorro.map(a => a.acumulado), borderColor: colors[2], backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, pointRadius: 4, yAxisID: 'y' },
          { label: 'Acumulado USD', data: ahorro.map(a => a.acumuladoUSD), borderColor: colors[1], borderDash: [5,5], tension: 0.3, pointRadius: 3, yAxisID: 'y1' }
        ] },
        options: { ...options, scales: {
          x: { ticks: { color: fontColor }, grid: { display: false } },
          y: { type: 'linear', position: 'left', ticks: { color: fontColor }, grid: { color: gridColor } },
          y1: { type: 'linear', position: 'right', ticks: { color: colors[1] }, grid: { display: false } }
        } }
      });
    }

    // Barras mensuales
    const ctx2 = document.getElementById('chart-ahorro-mensual')?.getContext('2d');
    if (ctx2) {
      const barColors = ahorro.map(a => a.ahorroMes >= 0 ? colors[2] + '99' : colors[4] + '99');
      chartInstances.ahorroMensual = new Chart(ctx2, {
        type: 'bar',
        data: { labels: MESES_SHORT, datasets: [{ label: 'Ahorro mensual', data: ahorro.map(a => a.ahorroMes), backgroundColor: barColors, borderRadius: 6 }] },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }

    // F4: Evolución de cartera chart
    if (snapshots.length > 0) {
      const ctx3 = document.getElementById('chart-cartera-evol')?.getContext('2d');
      if (ctx3) {
        const labels = evolution.map(e => e.mesId.charAt(0).toUpperCase() + e.mesId.slice(1, 3));
        chartInstances.carteraEvol = new Chart(ctx3, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Total ARS', data: evolution.map(e => e.granTotalARS), borderColor: colors[0], backgroundColor: colors[0] + '15', fill: true, tension: 0.3, pointRadius: 5, borderWidth: 2.5, yAxisID: 'y' },
              { label: 'Total USD', data: evolution.map(e => e.granTotalUSD), borderColor: colors[1], borderDash: [5, 5], tension: 0.3, pointRadius: 3, borderWidth: 1.5, yAxisID: 'y1' },
              { label: 'Liquidez ARS', data: evolution.map(e => e.liquidezARS), borderColor: colors[2], tension: 0.3, pointRadius: 3, borderWidth: 1.5, borderDash: [4, 4], yAxisID: 'y' },
              { label: 'Inversiones ARS', data: evolution.map(e => e.inversionesARS), borderColor: colors[5], tension: 0.3, pointRadius: 3, borderWidth: 1.5, borderDash: [4, 4], yAxisID: 'y' },
            ]
          },
          options: { ...options, scales: {
            x: { ticks: { color: fontColor }, grid: { display: false } },
            y: { type: 'linear', position: 'left', ticks: { color: fontColor }, grid: { color: gridColor } },
            y1: { type: 'linear', position: 'right', ticks: { color: colors[1] }, grid: { display: false } }
          } }
        });
      }
    }
  }).catch(e => console.error('Chart.js error:', e));
}
