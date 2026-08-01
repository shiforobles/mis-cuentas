/**
 * Dashboard Tab 4 — PATRIMONIO / AHORRO
 * Evolución patrimonial, ahorro acumulado, proyección de fin de año,
 * y evolución de cartera (F4).
 */
import { allMonths, dolarPorMes, dolarCCL, chartInstances, getChartDefaults, configData } from './dashboard.js';
import { calcAhorroAcumulado, calcProyeccionAnual, calcTotalMovimientosCapital } from '../services/calculations.js';
import { getPortfolioHistoryByYear, calcPortfolioEvolution, calcPortfolioReturns, deletePortfolioSnapshot } from '../services/portfolio-history.js';
import { getInflacionYear, acumularInflacion, acumularDolar } from '../services/inflation.js';
import { formatARS, formatUSD, formatPercent } from '../utils/format.js';
import { MESES_SHORT, mesesTranscurridos } from '../utils/constants.js';
import { showToast } from '../utils/helpers.js';

export async function renderTabPatrimonio(panel) {
  const ahorro = calcAhorroAcumulado(allMonths, 'real', dolarCCL, dolarPorMes);
  const proy = calcProyeccionAnual(allMonths, 'real', dolarCCL);
  const acumuladoActual = ahorro.length > 0 ? ahorro[ahorro.length - 1].acumulado : 0;
  const acumuladoUSD = ahorro.length > 0 ? ahorro[ahorro.length - 1].acumuladoUSD : 0;
  const año = configData?.año || 2026;

  // F4: Load portfolio evolution + rendimiento real (Δ − aportes)
  const snapshots = await getPortfolioHistoryByYear(año);
  const evolution = calcPortfolioEvolution(snapshots);
  const returns = calcPortfolioReturns(evolution, allMonths,
    (egresos) => calcTotalMovimientosCapital(egresos, 'real'));

  // Inflación (IPC INDEC) + dólar acumulado del año
  const nMeses = mesesTranscurridos(año);
  const inflMensual = await getInflacionYear(año);
  const inflAcum = acumularInflacion(inflMensual);
  const dolarAcum = acumularDolar(dolarPorMes, nMeses);
  const ultimoConDato = (() => { let k = -1; inflAcum.forEach((v, i) => { if (v != null) k = i; }); return k; })();
  const inflAcumTotal = ultimoConDato >= 0 ? inflAcum[ultimoConDato] : null;
  const dolarAcumMismoMes = ultimoConDato >= 0 ? dolarAcum[ultimoConDato] : null;
  const poderCompra = inflAcumTotal != null ? (1 / (1 + inflAcumTotal / 100) - 1) * 100 : null;

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

    <!-- Inflación y poder de compra -->
    <div class="card section">
      <h3 class="card__title"><span class="card__title-icon">🔥</span> Inflación y poder de compra (${año})</h3>
      ${inflAcumTotal != null ? `
        <div class="dashboard-grid" style="margin-bottom:var(--space-3)">
          <div><div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">INFLACIÓN ACUMULADA (a ${MESES_SHORT[ultimoConDato]})</div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:var(--color-danger-text)">${formatPercent(inflAcumTotal)}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">$100 de enero hoy compran como ${formatARS(100 * (1 + (poderCompra || 0) / 100))} → tu peso perdió ${formatPercent(Math.abs(poderCompra || 0))} de poder de compra</div>
          </div>
          <div><div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">DÓLAR CCL EN EL MISMO PERÍODO</div>
            <div style="font-size:var(--font-size-xl);font-weight:800;color:${(dolarAcumMismoMes || 0) >= inflAcumTotal ? 'var(--color-success-text)' : 'var(--color-warning-text, #d97706)'}">${dolarAcumMismoMes != null ? '+' + formatPercent(dolarAcumMismoMes) : '—'}</div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${dolarAcumMismoMes != null ? (dolarAcumMismoMes >= inflAcumTotal
              ? 'El dólar subió más que la inflación: ahorrar en USD te protegió ✓'
              : `El dólar subió menos que la inflación: tus USD perdieron ${formatPercent(inflAcumTotal - dolarAcumMismoMes)} contra los precios`) : ''}</div>
          </div>
        </div>
        <div class="chart-container" style="height:280px"><canvas id="chart-inflacion"></canvas></div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Fuente: IPC INDEC (ArgentinaDatos). El dato de cada mes se publica a mitad del mes siguiente.</div>
      ` : `
        <div class="text-muted" style="font-size:var(--font-size-sm)">Sin datos de inflación todavía (se descargan automáticamente con conexión).</div>
      `}
    </div>

    <!-- F4: Evolución de Cartera + Rendimiento real -->
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
              <th class="text-right" title="Plata nueva que entró a la cartera desde la categoría Inversión">Aportes</th>
              <th class="text-right" title="Δ del mes − aportes: cuánto rindió lo invertido">Rendimiento</th>
              <th class="text-right">Rend. %</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${returns.map(e => {
                const deltaColor = e.deltaARS >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
                const arrow = e.deltaARS > 0 ? '▲' : e.deltaARS < 0 ? '▼' : '—';
                const mesCap = e.mesId.charAt(0).toUpperCase() + e.mesId.slice(1);
                const rColor = e.rendimientoARS == null ? 'var(--color-text-muted)' : e.rendimientoARS >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)';
                return `<tr>
                  <td style="font-weight:600">${mesCap}</td>
                  <td class="text-right" style="font-weight:600">${formatARS(e.granTotalARS)}</td>
                  <td class="text-right" style="color:var(--color-info-text)">${formatUSD(e.granTotalUSD)}</td>
                  <td class="text-right" style="color:${deltaColor}">${arrow} ${formatARS(Math.abs(e.deltaARS))}</td>
                  <td class="text-right" style="color:var(--color-capital-text)">${e.aportesARS ? formatARS(e.aportesARS) : '—'}</td>
                  <td class="text-right" style="color:${rColor};font-weight:600">${e.rendimientoARS != null ? formatARS(e.rendimientoARS) : '—'}</td>
                  <td class="text-right" style="color:${rColor}">${e.rendimientoPct != null ? formatPercent(e.rendimientoPct) : '—'}</td>
                  <td class="text-right"><button class="row-delete btn-del-snap" data-id="${e.id}" data-mes="${mesCap}" title="Borrar snapshot">✕</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
          Rendimiento = lo que creció tu cartera en el mes descontando la plata nueva que aportaste. El snapshot del mes en curso se actualiza solo cada vez que abrís la app. El primer mes no tiene rendimiento porque no hay mes anterior para comparar.
        </div>
      ` : `
        <div class="empty-state" style="padding:var(--space-6) 0">
          <div class="empty-state__icon">📸</div>
          <div class="empty-state__text">No hay snapshots de cartera.</div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">Se guardan solos al abrir la app (si tu cartera tiene montos cargados).</div>
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

    // Inflación: barras mensuales + acumulada vs dólar acumulado
    if (inflAcumTotal != null) {
      const ctxI = document.getElementById('chart-inflacion')?.getContext('2d');
      if (ctxI) {
        chartInstances.inflacion = new Chart(ctxI, {
          data: {
            labels: MESES_SHORT,
            datasets: [
              { type: 'bar', label: 'Inflación mensual %', data: inflMensual, backgroundColor: colors[4] + '99', borderColor: colors[4], borderWidth: 1, borderRadius: 4, yAxisID: 'y' },
              { type: 'line', label: 'Inflación acumulada %', data: inflAcum, borderColor: colors[3], backgroundColor: colors[3] + '20', fill: true, tension: 0.3, pointRadius: 4, yAxisID: 'y1' },
              { type: 'line', label: 'Dólar CCL acumulado %', data: dolarAcum, borderColor: colors[1], borderDash: [6, 4], tension: 0.3, pointRadius: 3, yAxisID: 'y1' },
            ]
          },
          options: { ...options, scales: {
            x: { ticks: { color: fontColor }, grid: { display: false } },
            y: { position: 'left', ticks: { color: colors[4] }, grid: { color: gridColor }, title: { display: true, text: '% mensual', color: fontColor, font: { size: 10 } } },
            y1: { position: 'right', ticks: { color: fontColor }, grid: { display: false }, title: { display: true, text: '% acumulado', color: fontColor, font: { size: 10 } } }
          } }
        });
      }
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
