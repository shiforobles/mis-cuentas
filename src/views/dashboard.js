/**
 * MIS CUENTAS — Dashboard con 4 Pestañas
 * Shell principal que carga los sub-módulos por tab.
 */

import { dbGet, dbPut, dbGetAll } from '../db/database.js';
import { fetchDolar, getDolarActual, getDolarCCL, setDolarManual, saveDolarToMonth } from '../services/dollar.js';
import { calcTotalIngresos, calcTotalEgresos, calcIngresosUSD, calcTotalAnual, calcCartera } from '../services/calculations.js';
import { formatARS, formatUSD, formatDolar, formatPercent, formatDateTime, parseNumber } from '../utils/format.js';
import { MESES, MESES_LABEL, MESES_SHORT, DASHBOARD_TABS, CATEGORIAS_EGRESO, mesKey } from '../utils/constants.js';
import { $, showToast, debounce } from '../utils/helpers.js';
import { navigate } from '../router.js';

// Shared state across tabs
export let allMonths = [];
export let dolarPorMes = []; // Dólar resuelto de CADA mes (índice 0-11) vía getDolarCCL
export let configData = null;
export let portfolioData = null;
export let dolarCCL = 0; // Dólar "actual" (global, para el widget)
export let chartInstances = {};

let activeTab = 'ingresos';

export async function renderDashboard(tabParam) {
  const main = document.getElementById('app-main');

  // Load data
  configData = await dbGet('config', 'global');
  portfolioData = await dbGet('portfolio', 'current');
  dolarCCL = await getDolarActual();
  const año = configData?.año || 2026;

  allMonths = [];
  for (const mes of MESES) {
    allMonths.push(await dbGet('months', mesKey(mes, año)));
  }

  // Dólar resuelto por mes con toda la cadena (manual → mes → histórico →
  // anterior). Los tabs deben usar esto, nunca month.dolarCCL crudo, para que
  // los meses sin valor propio en este dispositivo no caigan al dólar de hoy.
  dolarPorMes = await Promise.all(MESES.map(mes => getDolarCCL(mesKey(mes, año))));

  activeTab = tabParam || 'ingresos';

  main.innerHTML = `
    <div class="dashboard-view fade-in">
      <div class="dashboard-header">
        <h1 class="dashboard-title">Dashboard ${año}</h1>
      </div>
      <div class="dash-tabs" id="dash-tabs">
        ${DASHBOARD_TABS.map(t => `
          <button class="dash-tab ${t.id === activeTab ? 'dash-tab--active' : ''}" data-tab="${t.id}">
            <span class="dash-tab__icon">${t.icon}</span>
            <span class="dash-tab__label">${t.label}</span>
          </button>
        `).join('')}
      </div>
      <div id="dash-panel"></div>
    </div>
  `;

  // Tab click handlers
  document.querySelectorAll('.dash-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === activeTab) return;
      activeTab = tab;
      document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('dash-tab--active'));
      btn.classList.add('dash-tab--active');
      window.history.replaceState(null, '', `#/dashboard/${tab}`);
      renderActivePanel();
    });
  });

  await renderActivePanel();
}

async function renderActivePanel() {
  // Destroy previous charts
  Object.values(chartInstances).forEach(c => c?.destroy?.());
  chartInstances = {};

  const panel = $('#dash-panel');
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:var(--space-8);color:var(--color-text-muted)">Cargando...</div>';

  switch (activeTab) {
    case 'ingresos': {
      const { renderTabIngresos } = await import('./dash-ingresos.js');
      renderTabIngresos(panel);
      break;
    }
    case 'cartera': {
      const { renderTabCartera } = await import('./dash-cartera.js');
      renderTabCartera(panel);
      break;
    }
    case 'gastos': {
      const { renderTabGastos } = await import('./dash-gastos.js');
      renderTabGastos(panel);
      break;
    }
    case 'patrimonio': {
      const { renderTabPatrimonio } = await import('./dash-patrimonio.js');
      renderTabPatrimonio(panel);
      break;
    }
  }
}

// ─── Shared helpers for sub-modules ─────────────────────
export function getChartDefaults() {
  const fontColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-secondary').trim() || '#94a3b8';
  const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() || '#2d3a4f';
  return {
    fontColor, gridColor,
    colors: ['#6366f1','#22d3ee','#22c55e','#f59e0b','#ef4444','#a855f7','#ec4899','#f97316','#14b8a6','#38bdf8','#64748b'],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: fontColor, font: { family: 'Inter', size: 11 } } } }
    }
  };
}

export function renderDollarWidget(container) {
  const isManual = configData?.dolarCCLManual != null;
  const fecha = configData?.dolarCCLFechaUpdate;
  const todas = configData?.dolarTodas || {};

  container.innerHTML = `
    <div class="card card--accent">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:var(--space-3)">
        <div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">
            DÓLAR CCL ${isManual ? '<span class="badge badge--warning" style="margin-left:4px">Manual</span>' : ''}
          </div>
          <div style="font-size:var(--font-size-2xl);font-weight:800;color:var(--color-info-text)">${formatDolar(dolarCCL)}</div>
          ${fecha ? `<div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:2px">Actualizado: ${formatDateTime(fecha)}</div>` : ''}
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn--secondary btn--sm" id="btn-refresh-dollar">🔄 Actualizar</button>
          <button class="btn btn--ghost btn--sm" id="btn-override-dollar">✏️</button>
        </div>
      </div>
      ${Object.keys(todas).length > 0 ? `
        <div style="display:flex;gap:var(--space-4);margin-top:var(--space-3);flex-wrap:wrap;padding-top:var(--space-3);border-top:1px solid var(--color-border)">
          ${Object.entries(todas).filter(([k]) => k !== 'contadoconliqui').map(([k, v]) => `
            <div style="font-size:var(--font-size-xs)"><span style="color:var(--color-text-tertiary)">${v.nombre || k}:</span> <span style="font-weight:600">${formatDolar(v.venta)}</span></div>
          `).join('')}
        </div>` : ''}
    </div>
  `;

  $('#btn-refresh-dollar')?.addEventListener('click', async () => {
    const btn = $('#btn-refresh-dollar');
    btn.textContent = '⏳'; btn.disabled = true;
    try {
      await fetchDolar(); // saves to current month automatically
      dolarCCL = await getDolarActual();
      configData = await dbGet('config', 'global');
      showToast(`Dólar: ${formatDolar(dolarCCL)}`, 'success');
      renderDollarWidget(container);
    } catch { showToast('Error al actualizar', 'error'); }
    btn.disabled = false;
  });

  $('#btn-override-dollar')?.addEventListener('click', () => {
    const val = prompt('Valor manual del dólar CCL (vacío = API):');
    if (val === null) return;
    if (val.trim() === '') {
      setDolarManual(null).then(async () => { dolarCCL = await getDolarActual(); configData = await dbGet('config','global'); renderDollarWidget(container); });
    } else {
      const n = parseNumber(val);
      if (n > 0) setDolarManual(n).then(async () => { dolarCCL = n; configData = await dbGet('config','global'); renderDollarWidget(container); });
    }
  });
}
