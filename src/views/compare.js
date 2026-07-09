/**
 * MIS CUENTAS — Vista Comparativa entre Meses (F3)
 * Compara 2 meses lado a lado: ingresos, egresos por categoría, restante.
 */

import { dbGet } from '../db/database.js';
import { calcTotalIngresos, calcTotalEgresos, calcSubtotalCategoria, calcTotalMovimientosCapital } from '../services/calculations.js';
import { formatARS, formatPercent } from '../utils/format.js';
import { MESES, MESES_LABEL, MESES_SHORT, CATEGORIAS_EGRESO, mesKey } from '../utils/constants.js';
import { $ } from '../utils/helpers.js';

export async function renderCompare(paramStr) {
  const main = document.getElementById('app-main');
  const config = await dbGet('config', 'global');
  const año = config?.año || 2026;

  const currentIdx = new Date().getMonth();
  let idxA = currentIdx > 0 ? currentIdx - 1 : 11;
  let idxB = currentIdx;

  if (paramStr && paramStr.includes('-')) {
    const parts = paramStr.split('-');
    const a = MESES.indexOf(parts[0]);
    const b = MESES.indexOf(parts[1]);
    if (a >= 0) idxA = a;
    if (b >= 0) idxB = b;
  }

  main.innerHTML = `
    <div class="compare-view fade-in">
      <h1 class="compare-title">📊 Comparar Meses</h1>
      <div class="compare-selectors">
        <div class="compare-selector">
          <label class="compare-selector__label">Mes A</label>
          <select class="form-field__input" id="compare-sel-a">
            ${MESES.map((m, i) => `<option value="${i}" ${i === idxA ? 'selected' : ''}>${MESES_LABEL[i]}</option>`).join('')}
          </select>
        </div>
        <div class="compare-selector__vs">VS</div>
        <div class="compare-selector">
          <label class="compare-selector__label">Mes B</label>
          <select class="form-field__input" id="compare-sel-b">
            ${MESES.map((m, i) => `<option value="${i}" ${i === idxB ? 'selected' : ''}>${MESES_LABEL[i]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="compare-content"></div>
    </div>
  `;

  const renderComparison = async () => {
    const a = parseInt($('#compare-sel-a').value);
    const b = parseInt($('#compare-sel-b').value);
    const monthA = await dbGet('months', mesKey(MESES[a], año));
    const monthB = await dbGet('months', mesKey(MESES[b], año));
    const container = $('#compare-content');

    if (!monthA || !monthB) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state__text">Sin datos para uno o ambos meses.</div></div>`;
      return;
    }

    const ingA = calcTotalIngresos(monthA.ingresos, 'real');
    const ingB = calcTotalIngresos(monthB.ingresos, 'real');
    const egA = calcTotalEgresos(monthA.egresos, 'real');
    const egB = calcTotalEgresos(monthB.egresos, 'real');
    const invA = calcTotalMovimientosCapital(monthA.egresos, 'real');
    const invB = calcTotalMovimientosCapital(monthB.egresos, 'real');
    const restA = ingA - egA;
    const restB = ingB - egB;
    const categoriasGasto = CATEGORIAS_EGRESO.filter(c => !c.esTransferencia);
    const categoriasCapital = CATEGORIAS_EGRESO.filter(c => c.esTransferencia);

    const arrow = (delta) => delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    const deltaColor = (delta, inverted = false) => {
      if (delta === 0) return 'var(--color-text-muted)';
      const positive = inverted ? delta < 0 : delta > 0;
      return positive ? 'var(--color-success-text)' : 'var(--color-danger-text)';
    };

    const dIng = ingB - ingA;
    const dEg = egB - egA;
    const dInv = invB - invA;
    const dRest = restB - restA;

    container.innerHTML = `
      <div class="compare-summary">
        <div class="compare-card">
          <div class="compare-card__label">Ingresos</div>
          <div class="compare-card__values">
            <span class="text-success">${formatARS(ingA)}</span>
            <span class="compare-card__arrow" style="color:${deltaColor(dIng)}">${arrow(dIng)}</span>
            <span class="text-success">${formatARS(ingB)}</span>
          </div>
          <div class="compare-card__delta" style="color:${deltaColor(dIng)}">${arrow(dIng)} ${formatARS(Math.abs(dIng))}</div>
        </div>
        <div class="compare-card">
          <div class="compare-card__label">Egresos</div>
          <div class="compare-card__values">
            <span class="text-danger">${formatARS(egA)}</span>
            <span class="compare-card__arrow" style="color:${deltaColor(dEg, true)}">${arrow(dEg)}</span>
            <span class="text-danger">${formatARS(egB)}</span>
          </div>
          <div class="compare-card__delta" style="color:${deltaColor(dEg, true)}">${arrow(dEg)} ${formatARS(Math.abs(dEg))}</div>
        </div>
        <div class="compare-card">
          <div class="compare-card__label">💰 Inversión</div>
          <div class="compare-card__values">
            <span style="color:var(--color-capital-text)">${formatARS(invA)}</span>
            <span class="compare-card__arrow" style="color:${deltaColor(dInv)}">${arrow(dInv)}</span>
            <span style="color:var(--color-capital-text)">${formatARS(invB)}</span>
          </div>
          <div class="compare-card__delta" style="color:${deltaColor(dInv)}">${arrow(dInv)} ${formatARS(Math.abs(dInv))}</div>
        </div>
        <div class="compare-card">
          <div class="compare-card__label">Restante</div>
          <div class="compare-card__values">
            <span style="color:${restA >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${formatARS(restA)}</span>
            <span class="compare-card__arrow" style="color:${deltaColor(dRest)}">${arrow(dRest)}</span>
            <span style="color:${restB >= 0 ? 'var(--color-success-text)' : 'var(--color-danger-text)'}">${formatARS(restB)}</span>
          </div>
          <div class="compare-card__delta" style="color:${deltaColor(dRest)}">${arrow(dRest)} ${formatARS(Math.abs(dRest))}</div>
        </div>
      </div>

      <div class="card section">
        <h3 class="card__title"><span class="card__title-icon">🏷️</span> Egresos por Categoría</h3>
        <div class="annual-table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Categoría</th>
              <th class="text-right">${MESES_SHORT[a]}</th>
              <th class="text-right">${MESES_SHORT[b]}</th>
              <th class="text-right">Δ</th>
              <th>Tendencia</th>
            </tr></thead>
            <tbody>
              ${categoriasGasto.map(cat => {
                const valA = calcSubtotalCategoria(monthA.egresos[cat.id], 'real');
                const valB = calcSubtotalCategoria(monthB.egresos[cat.id], 'real');
                const delta = valB - valA;
                const maxVal = Math.max(valA, valB, 1);
                const pctA = (valA / maxVal) * 100;
                const pctB = (valB / maxVal) * 100;
                return `<tr>
                  <td style="font-weight:500">${cat.icon} ${cat.nombre}</td>
                  <td class="text-right">${formatARS(valA)}</td>
                  <td class="text-right">${formatARS(valB)}</td>
                  <td class="text-right" style="color:${deltaColor(delta, true)};font-weight:600">${arrow(delta)} ${formatARS(Math.abs(delta))}</td>
                  <td><div class="compare-bar"><div class="compare-bar__a" style="width:${pctA}%"></div><div class="compare-bar__b" style="width:${pctB}%"></div></div></td>
                </tr>`;
              }).join('')}
              <tr class="data-table--total">
                <td><strong>TOTAL</strong></td>
                <td class="text-right"><strong>${formatARS(egA)}</strong></td>
                <td class="text-right"><strong>${formatARS(egB)}</strong></td>
                <td class="text-right" style="color:${deltaColor(dEg, true)};font-weight:700">${arrow(dEg)} ${formatARS(Math.abs(dEg))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      ${categoriasCapital.length ? `
      <div class="card section">
        <h3 class="card__title"><span class="card__title-icon">💰</span> Inversión / Movimiento de Capital</h3>
        <div class="annual-table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Categoría</th>
              <th class="text-right">${MESES_SHORT[a]}</th>
              <th class="text-right">${MESES_SHORT[b]}</th>
              <th class="text-right">Δ</th>
              <th>Tendencia</th>
            </tr></thead>
            <tbody>
              ${categoriasCapital.map(cat => {
                const valA = calcSubtotalCategoria(monthA.egresos[cat.id], 'real');
                const valB = calcSubtotalCategoria(monthB.egresos[cat.id], 'real');
                const delta = valB - valA;
                const maxVal = Math.max(valA, valB, 1);
                const pctA = (valA / maxVal) * 100;
                const pctB = (valB / maxVal) * 100;
                return `<tr>
                  <td style="font-weight:500">${cat.icon} ${cat.nombre}</td>
                  <td class="text-right">${formatARS(valA)}</td>
                  <td class="text-right">${formatARS(valB)}</td>
                  <td class="text-right" style="color:${deltaColor(delta)};font-weight:600">${arrow(delta)} ${formatARS(Math.abs(delta))}</td>
                  <td><div class="compare-bar"><div class="compare-bar__a" style="width:${pctA}%"></div><div class="compare-bar__b" style="width:${pctB}%"></div></div></td>
                </tr>`;
              }).join('')}
              <tr class="data-table--total">
                <td><strong>TOTAL</strong></td>
                <td class="text-right"><strong>${formatARS(invA)}</strong></td>
                <td class="text-right"><strong>${formatARS(invB)}</strong></td>
                <td class="text-right" style="color:${deltaColor(dInv)};font-weight:700">${arrow(dInv)} ${formatARS(Math.abs(dInv))}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      ` : ''}

      <div class="card section">
        <h3 class="card__title"><span class="card__title-icon">📊</span> Comparación Visual</h3>
        <div class="chart-container" style="height:300px"><canvas id="chart-compare"></canvas></div>
      </div>

      <div class="card section">
        <h3 class="card__title"><span class="card__title-icon">💼</span> Ingresos</h3>
        <div class="annual-table-wrap">
          <table class="data-table">
            <thead><tr>
              <th>Descripción</th>
              <th class="text-right">${MESES_SHORT[a]}</th>
              <th class="text-right">${MESES_SHORT[b]}</th>
              <th class="text-right">Δ</th>
            </tr></thead>
            <tbody>${buildIncomeComparison(monthA.ingresos, monthB.ingresos, deltaColor, arrow)}</tbody>
          </table>
        </div>
      </div>
    `;

    import('chart.js').then(({ Chart, registerables }) => {
      Chart.register(...registerables);
      const fontColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#94a3b8';
      const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#2d3a4f';
      const labels = categoriasGasto.map(c => c.nombre);
      const dataA = categoriasGasto.map(c => calcSubtotalCategoria(monthA.egresos[c.id], 'real'));
      const dataB = categoriasGasto.map(c => calcSubtotalCategoria(monthB.egresos[c.id], 'real'));
      const ctx = document.getElementById('chart-compare')?.getContext('2d');
      if (ctx) {
        new Chart(ctx, {
          type: 'bar',
          data: { labels, datasets: [
            { label: MESES_LABEL[a], data: dataA, backgroundColor: '#6366f199', borderColor: '#6366f1', borderWidth: 1, borderRadius: 4 },
            { label: MESES_LABEL[b], data: dataB, backgroundColor: '#22d3ee99', borderColor: '#22d3ee', borderWidth: 1, borderRadius: 4 },
          ] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: fontColor, font: { family: 'Inter', size: 11 } } } },
            scales: {
              x: { ticks: { color: fontColor, font: { size: 9 }, maxRotation: 45 }, grid: { display: false } },
              y: { ticks: { color: fontColor }, grid: { color: gridColor } }
            }
          }
        });
      }
    });
  };

  await renderComparison();
  $('#compare-sel-a').addEventListener('change', renderComparison);
  $('#compare-sel-b').addEventListener('change', renderComparison);
}

function buildIncomeComparison(ingA, ingB, deltaColor, arrow) {
  const all = new Map();
  for (const item of (ingA || [])) {
    all.set(item.descripcion.toLowerCase(), { desc: item.descripcion, a: item.real || 0, b: 0 });
  }
  for (const item of (ingB || [])) {
    const key = item.descripcion.toLowerCase();
    if (all.has(key)) { all.get(key).b = item.real || 0; }
    else { all.set(key, { desc: item.descripcion, a: 0, b: item.real || 0 }); }
  }
  return [...all.values()].map(item => {
    const delta = item.b - item.a;
    return `<tr>
      <td style="font-weight:500">${item.desc}</td>
      <td class="text-right">${formatARS(item.a)}</td>
      <td class="text-right">${formatARS(item.b)}</td>
      <td class="text-right" style="color:${deltaColor(delta)};font-weight:600">${arrow(delta)} ${formatARS(Math.abs(delta))}</td>
    </tr>`;
  }).join('');
}
