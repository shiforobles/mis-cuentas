/**
 * Dashboard Tab 1 — INGRESOS
 * Tabla mensual, gráfico barras ingresos, línea dólar, línea ahorros.
 *
 * Muestra lo REAL por defecto (lo que efectivamente pasó); el toggle permite
 * ver lo proyectado. El gráfico de ingresos siempre compara ambos.
 */
import { allMonths, dolarPorMes, configData, dolarCCL, chartInstances, getChartDefaults, renderDollarWidget } from './dashboard.js';
import { calcTotalIngresos, calcTotalEgresos, calcIngresosUSD, calcTotalAnual } from '../services/calculations.js';
import { formatARS, formatUSD, formatDolar, formatPercent, formatHours, parseHours } from '../utils/format.js';
import { MESES_SHORT, mesesTranscurridos } from '../utils/constants.js';
import { navigate } from '../router.js';

// Modo de la pestaña: 'real' (default) | 'proyectado'. Se recuerda entre visitas.
function readMode() {
  try {
    const v = localStorage.getItem('misCuentas.dashIngresosMode');
    return v === 'proyectado' || v === 'real' ? v : 'real';
  } catch { return 'real'; }
}

export function renderTabIngresos(panel) {
  const modo = readMode();
  // Solo contar/mostrar meses hasta el actual (años pasados: 12 completos).
  const año = configData?.año || 2026;
  const nMeses = mesesTranscurridos(año);
  const mesesVisibles = allMonths.slice(0, nMeses);
  const labelsVisibles = MESES_SHORT.slice(0, nMeses);

  const anual = calcTotalAnual(mesesVisibles, modo, dolarCCL, dolarPorMes);
  const anualProy = calcTotalAnual(mesesVisibles, 'proyectado', dolarCCL, dolarPorMes);
  const cumplimientoAnual = anualProy.totalARS > 0
    ? (calcTotalAnual(mesesVisibles, 'real', dolarCCL, dolarPorMes).totalARS / anualProy.totalARS) * 100
    : 0;

  panel.innerHTML = `
    <div id="dollar-widget" class="section"></div>
    <div class="card section">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-2)">
        <h2 class="card__title" style="margin-bottom:0"><span class="card__title-icon">📋</span> Ingresos Mensuales</h2>
        <div class="toggle-group" id="dash-ing-toggle">
          <button class="toggle-group__btn ${modo === 'real' ? 'toggle-group__btn--active' : ''}" data-mode="real">Real</button>
          <button class="toggle-group__btn ${modo === 'proyectado' ? 'toggle-group__btn--active' : ''}" data-mode="proyectado">Proyectado</button>
        </div>
      </div>
      <div class="annual-table-wrap" style="margin-top:var(--space-3)">
        <table class="data-table annual-table">
          <thead><tr>
            <th>Mes</th><th class="text-right">Dólar</th><th class="text-right">Ingresos $</th>
            <th class="text-right">Ingresos USD</th><th class="text-right">Ahorro $</th><th class="text-right">Ahorro USD</th>
            ${modo === 'real' ? '<th class="text-right" title="Ingresos reales vs proyectados">% Cumpl.</th>' : ''}
          </tr></thead>
          <tbody>
            ${allMonths.map((m, i) => {
              if (!m || i >= nMeses) return '';
              const ing = calcTotalIngresos(m.ingresos, modo);
              const eg = calcTotalEgresos(m.egresos, modo);
              const dm = dolarPorMes[i] || dolarCCL;
              const ingUSD = calcIngresosUSD(ing, dm);
              const ahorro = ing - eg;
              const ahUSD = calcIngresosUSD(ahorro, dm);
              let cumplCell = '';
              if (modo === 'real') {
                const proy = calcTotalIngresos(m.ingresos, 'proyectado');
                const pct = proy > 0 ? (calcTotalIngresos(m.ingresos, 'real') / proy) * 100 : 0;
                const color = pct >= 100 ? 'var(--color-success-text)' : pct >= 85 ? 'var(--color-text-secondary)' : 'var(--color-warning-text, #d97706)';
                cumplCell = `<td class="text-right" style="color:${color};font-weight:600">${proy > 0 ? formatPercent(pct, 0) : '—'}</td>`;
              }
              return `<tr style="cursor:pointer" data-mes="${i}">
                <td style="font-weight:600">${MESES_SHORT[i]}</td>
                <td class="text-right text-muted">${formatDolar(dm)}</td>
                <td class="text-right">${formatARS(ing)}</td>
                <td class="text-right" style="color:var(--color-info-text)">${formatUSD(ingUSD)}</td>
                <td class="text-right ${ahorro >= 0 ? 'text-success' : 'text-danger'}">${formatARS(ahorro)}</td>
                <td class="text-right ${ahUSD >= 0 ? 'text-success' : 'text-danger'}">${formatUSD(ahUSD)}</td>
                ${cumplCell}
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="data-table--total">
              <td><strong>TOTAL</strong></td><td></td>
              <td class="text-right"><strong>${formatARS(anual.totalARS)}</strong></td>
              <td class="text-right" style="color:var(--color-info-text)"><strong>${formatUSD(anual.totalUSD)}</strong></td>
              <td></td><td></td>
              ${modo === 'real' ? `<td class="text-right"><strong>${formatPercent(cumplimientoAnual, 0)}</strong></td>` : ''}
            </tr>
            <tr style="font-size:var(--font-size-xs);color:var(--color-text-secondary)">
              <td>Promedio</td><td></td>
              <td class="text-right">${formatARS(anual.promedioARS)}</td>
              <td class="text-right">${formatUSD(anual.promedioUSD)}</td>
              <td colspan="${modo === 'real' ? 3 : 2}" class="text-right">${anual.mesesConDatos} mes${anual.mesesConDatos !== 1 ? 'es' : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
    <div class="dashboard-grid">
      <div class="section"><div class="card"><h3 class="card__title"><span class="card__title-icon">💰</span> Ingresos: Proyectado vs Real</h3><div class="chart-container"><canvas id="chart-ingresos"></canvas></div></div></div>
      <div class="section"><div class="card"><h3 class="card__title"><span class="card__title-icon">📈</span> Dólar CCL</h3><div class="chart-container"><canvas id="chart-dolar"></canvas></div></div></div>
      <div class="section dashboard-grid__full"><div class="card"><h3 class="card__title"><span class="card__title-icon">🏦</span> Ahorro Mensual (${modo})</h3><div class="chart-container"><canvas id="chart-ahorro"></canvas></div></div></div>
    </div>
    <div class="card section" id="card-hora"></div>
  `;

  renderDollarWidget(document.getElementById('dollar-widget'));
  renderIngresoPorHora(document.getElementById('card-hora'), mesesVisibles);

  // Toggle Real / Proyectado
  panel.querySelectorAll('#dash-ing-toggle .toggle-group__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === modo) return;
      try { localStorage.setItem('misCuentas.dashIngresosMode', btn.dataset.mode); } catch { /* ignore */ }
      Object.values(chartInstances).forEach(c => c?.destroy?.());
      renderTabIngresos(panel);
    });
  });

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

    // Bar: Ingresos proyectado vs real (comparación siempre visible)
    const ctx1 = document.getElementById('chart-ingresos')?.getContext('2d');
    if (ctx1) {
      chartInstances.ingresos = new Chart(ctx1, {
        type: 'bar',
        data: { labels: labelsVisibles, datasets: [
          { label: 'Proyectado', data: mesesVisibles.map(m => m ? calcTotalIngresos(m.ingresos, 'proyectado') : 0), backgroundColor: colors[10] + '55', borderColor: colors[10], borderWidth: 1, borderRadius: 6 },
          { label: 'Real', data: mesesVisibles.map(m => m ? calcTotalIngresos(m.ingresos, 'real') : 0), backgroundColor: colors[0] + '99', borderColor: colors[0], borderWidth: 1, borderRadius: 6 },
        ] },
        options: { ...options, scales: scaleOpts }
      });
    }

    // Line: Dólar
    const ctx2 = document.getElementById('chart-dolar')?.getContext('2d');
    if (ctx2) {
      chartInstances.dolar = new Chart(ctx2, {
        type: 'line',
        data: { labels: labelsVisibles, datasets: [{ label: 'Dólar CCL', data: mesesVisibles.map((m, i) => dolarPorMes[i] || dolarCCL), borderColor: colors[1], backgroundColor: 'rgba(34,211,238,0.1)', fill: true, tension: 0.3, pointRadius: 4 }] },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { color: gridColor } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }

    // Line: Ahorro (según modo elegido)
    const ctx3 = document.getElementById('chart-ahorro')?.getContext('2d');
    if (ctx3) {
      const ahorroData = mesesVisibles.map(m => {
        if (!m) return 0;
        return calcTotalIngresos(m.ingresos, modo) - calcTotalEgresos(m.egresos, modo);
      });
      chartInstances.ahorro = new Chart(ctx3, {
        type: 'line',
        data: { labels: labelsVisibles, datasets: [{ label: `Ahorro $ (${modo})`, data: ahorroData, borderColor: colors[2], backgroundColor: 'rgba(34,197,94,0.1)', fill: true, tension: 0.3, pointRadius: 4 }] },
        options: { ...options, scales: { x: { ticks: { color: fontColor }, grid: { display: false } }, y: { ticks: { color: fontColor }, grid: { color: gridColor } } } }
      });
    }
  }).catch(e => console.error('Chart.js error:', e));
}

/**
 * Tarjeta "Ingreso por hora": para cada trabajo (agrupado por descripción),
 * suma los ingresos REALES del año y las horas mensuales de los meses en que
 * ese trabajo facturó, y calcula el valor hora. Ordena de mayor a menor.
 * Sirve para ver qué trabajo rinde más por hora invertida.
 */
function renderIngresoPorHora(container, mesesVisibles) {
  if (!container) return;

  const porTrabajo = new Map(); // key: descripcion lower → { desc, real, horas, meses }
  for (const m of mesesVisibles) {
    if (!m) continue;
    for (const item of m.ingresos || []) {
      const real = Number(item.real) || 0;
      const horas = parseHours(item.horasMensuales);
      if (real <= 0) continue; // solo meses en que ese trabajo facturó
      const key = (item.descripcion || '').trim().toLowerCase();
      if (!key || key.includes('histórico') || key.includes('historico')) continue; // saltar import Excel
      if (!porTrabajo.has(key)) porTrabajo.set(key, { desc: item.descripcion, real: 0, horas: 0, meses: 0 });
      const t = porTrabajo.get(key);
      t.real += real;
      t.horas += horas;
      t.meses++;
    }
  }

  const conHoras = [...porTrabajo.values()].filter(t => t.horas > 0)
    .map(t => ({ ...t, porHora: t.real / t.horas }))
    .sort((a, b) => b.porHora - a.porHora);

  if (!conHoras.length) {
    container.innerHTML = `
      <h3 class="card__title"><span class="card__title-icon">⏱️</span> Ingreso real por hora</h3>
      <div class="text-muted" style="font-size:var(--font-size-sm)">Cargá las horas mensuales de tus ingresos (columna Hs/mes en la vista Mes) para ver cuánto rinde cada trabajo por hora.</div>`;
    return;
  }

  const maxHora = conHoras[0].porHora;
  container.innerHTML = `
    <h3 class="card__title"><span class="card__title-icon">⏱️</span> Ingreso real por hora (por trabajo)</h3>
    <div class="text-muted" style="font-size:var(--font-size-xs);margin-bottom:var(--space-3)">Suma de ingresos reales ÷ horas mensuales, de los meses en que cada trabajo facturó. Para decidir dónde conviene poner horas.</div>
    ${conHoras.map(t => `
      <div style="margin-bottom:var(--space-3)">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;gap:var(--space-2)">
          <span style="font-weight:600;font-size:var(--font-size-sm)">${t.desc}</span>
          <span style="white-space:nowrap"><strong>${formatARS(t.porHora)}/h</strong> <span class="text-muted" style="font-size:var(--font-size-xs)">· ${formatHours(t.horas / t.meses)}/mes · ${t.meses} mes${t.meses !== 1 ? 'es' : ''}</span></span>
        </div>
        <div style="position:relative;height:6px;background:var(--color-bg-tertiary, rgba(255,255,255,.08));border-radius:999px;overflow:hidden">
          <div style="position:absolute;inset:0 auto 0 0;width:${Math.max(3, (t.porHora / maxHora) * 100)}%;background:var(--color-info-text, #3b82f6);border-radius:999px"></div>
        </div>
      </div>
    `).join('')}
  `;
}
