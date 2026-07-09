/**
 * MIS CUENTAS — Vista Mensual (Presupuesto del Mes)
 * Contiene: selector de meses, toggle proy/real, ingresos, egresos,
 * distribución ideal, resultado, copiar mes anterior, toggle recurrentes.
 */

import { dbGet, dbPut, dbGetAll, dbDelete } from '../db/database.js';
import { getDolarCCL, setDolarManualForMonth, getMonthDolarInfo } from '../services/dollar.js';
import {
  calcTotalIngresos, calcTotalEgresos, calcSubtotalCategoria,
  calcRestante, calcIngresosUSD, calcDistribucionIdeal, calcTotalHoras,
  calcTotalMovimientosCapital
} from '../services/calculations.js';
import { getTransactionsForItem, deleteTransaction } from '../services/transactions.js';
import { formatARS, formatUSD, formatPercent, formatHours, parseNumber, parseHours } from '../utils/format.js';
import { MESES, MESES_LABEL, MESES_SHORT, CATEGORIAS_EGRESO, mesKey } from '../utils/constants.js';
import { $, $$, createElement, debounce, generateId, showToast, clearElement } from '../utils/helpers.js';
import { navigate } from '../router.js';

let currentMonth = null; // mesId sin año (ej: 'mayo')
let currentMonthKey = null; // mesKey con año (ej: 'mayo-2026')
let currentAño = 2026;
let monthData = null;
let configData = null;
let dolarCCL = 0;
let dolarInfo = null; // { valor, fuente:'manual'|'promedio'|'estimado', dias }
// Modo de la vista. Se recuerda entre recargas (localStorage) y arranca en
// 'real' para que los gastos cargados se vean de inmediato en los totales
// (en 'proyectado' el total no refleja lo real y parece que "no suma").
let viewMode = readViewMode(); // 'proyectado' | 'real'

function readViewMode() {
  try {
    const v = localStorage.getItem('misCuentas.viewMode');
    return v === 'proyectado' || v === 'real' ? v : 'real';
  } catch {
    return 'real';
  }
}

// Debounced save
const debouncedSave = debounce(saveMonthData, 500);

/**
 * Renderiza la vista mensual completa.
 * @param {string} mesId - ID del mes (ej: 'enero')
 */
export async function renderMonthlyView(mesId) {
  currentMonth = mesId;
  const main = document.getElementById('app-main');
  
  // Cargar datos
  configData = await dbGet('config', 'global');
  currentAño = configData?.año || 2026;
  currentMonthKey = mesKey(mesId, currentAño);
  
  monthData = await dbGet('months', currentMonthKey);
  dolarCCL = await getDolarCCL(currentMonthKey);
  dolarInfo = await getMonthDolarInfo(currentMonthKey);
  
  if (!monthData) {
    main.innerHTML = `<div class="empty-state">
      <div class="empty-state__icon">📭</div>
      <div class="empty-state__text">No hay datos para este mes.</div>
    </div>`;
    return;
  }
  
  const mesIndex = MESES.indexOf(mesId);
  const mesLabel = MESES_LABEL[mesIndex];
  
  main.innerHTML = `
    <div class="monthly-view fade-in">
      <!-- Header del mes -->
      <div class="monthly-header">
        <div class="monthly-header__top">
          <h1 class="monthly-title">
            <span class="monthly-title__month">${mesLabel}</span>
            <span class="monthly-title__year">${currentAño}</span>
          </h1>
          <div style="display:flex;gap:var(--space-2);align-items:center">
            <button class="btn btn--ghost btn--sm" id="btn-copy-month" title="Copiar desde otro mes">📋</button>
            <div class="toggle-group" id="toggle-mode">
              <button class="toggle-group__btn ${viewMode === 'proyectado' ? 'toggle-group__btn--active' : ''}" data-mode="proyectado">
                Proyectado
              </button>
              <button class="toggle-group__btn ${viewMode === 'real' ? 'toggle-group__btn--active' : ''}" data-mode="real">
                Real
              </button>
            </div>
          </div>
        </div>
        <!-- Tabs de meses -->
        <div class="month-tabs" id="month-tabs"></div>
      </div>
      
      <!-- Resultado del mes (arriba para visibilidad) -->
      <div class="section" id="section-result"></div>
      
      <!-- Ingresos -->
      <div class="section" id="section-ingresos"></div>
      
      <!-- Egresos -->
      <div class="section" id="section-egresos"></div>
      
      <!-- Distribución Ideal -->
      <div class="section" id="section-distribucion"></div>
    </div>
  `;
  
  // Renderizar sub-componentes
  renderMonthTabs(mesId);
  renderToggle();
  renderResult();
  renderIngresos();
  renderEgresos();
  renderDistribucion();
  
  // Bind copy month button (F1)
  $('#btn-copy-month')?.addEventListener('click', openCopyMonthModal);
}

// ─── COPY MONTH MODAL (F1) ─────────────────────────────
async function openCopyMonthModal() {
  const existingModal = document.getElementById('copy-month-modal');
  if (existingModal) existingModal.remove();
  
  const modal = createElement('div', {
    id: 'copy-month-modal',
    className: 'modal fade-in',
  });
  
  const currentIdx = MESES.indexOf(currentMonth);
  const defaultSource = currentIdx > 0 ? currentIdx - 1 : 11;
  
  modal.innerHTML = `
    <div class="modal__content" style="max-width:400px;width:95%">
      <div class="modal__header">
        <h3 class="modal__title">📋 Copiar desde otro mes</h3>
        <button class="modal__close" id="btn-close-copy">✕</button>
      </div>
      <div class="modal__body">
        <div class="form-field" style="margin-bottom:var(--space-4)">
          <label class="form-field__label">Mes origen</label>
          <select class="form-field__input" id="copy-source-month">
            ${MESES.map((m, i) => `<option value="${m}" ${i === defaultSource ? 'selected' : ''}>${MESES_LABEL[i]}</option>`).join('')}
          </select>
        </div>
        <div class="form-field" style="margin-bottom:var(--space-4)">
          <label class="form-field__label">¿Qué copiar?</label>
          <div style="display:flex;flex-direction:column;gap:var(--space-2)">
            <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer">
              <input type="radio" name="copy-mode" value="structure" checked> Solo estructura (descripciones)
            </label>
            <label style="display:flex;align-items:center;gap:var(--space-2);cursor:pointer">
              <input type="radio" name="copy-mode" value="projected"> Estructura + proyectados
            </label>
          </div>
        </div>
        <div class="form-field__hint">Se agregarán los ítems que no existan. No se sobrescriben ítems existentes.</div>
      </div>
      <div class="modal__footer">
        <button class="btn btn--secondary" id="btn-cancel-copy">Cancelar</button>
        <button class="btn btn--primary" id="btn-confirm-copy">Copiar</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  $('#btn-close-copy').addEventListener('click', () => modal.remove());
  $('#btn-cancel-copy').addEventListener('click', () => modal.remove());
  
  $('#btn-confirm-copy').addEventListener('click', async () => {
    const sourceMes = $('#copy-source-month').value;
    const mode = document.querySelector('input[name="copy-mode"]:checked').value;
    const sourceKey = mesKey(sourceMes, currentAño);
    const sourceData = await dbGet('months', sourceKey);
    
    if (!sourceData) {
      showToast('No hay datos en el mes origen', 'warning');
      return;
    }
    
    let added = 0;
    
    // Copiar ingresos
    for (const srcItem of sourceData.ingresos) {
      const exists = monthData.ingresos.some(i => i.descripcion.toLowerCase() === srcItem.descripcion.toLowerCase());
      if (!exists) {
        monthData.ingresos.push({
          id: generateId(),
          descripcion: srcItem.descripcion,
          proyectado: mode === 'projected' ? srcItem.proyectado : 0,
          real: 0,
          horasSemanales: srcItem.horasSemanales || '',
          horasMensuales: srcItem.horasMensuales || '',
          horasTotal: '',
        });
        added++;
      }
    }
    
    // Copiar egresos
    for (const [catId, catData] of Object.entries(sourceData.egresos)) {
      if (!monthData.egresos[catId]) monthData.egresos[catId] = { items: [] };
      for (const srcItem of (catData.items || [])) {
        const exists = monthData.egresos[catId].items.some(i => i.descripcion.toLowerCase() === srcItem.descripcion.toLowerCase());
        if (!exists) {
          monthData.egresos[catId].items.push({
            id: generateId(),
            descripcion: srcItem.descripcion,
            proyectado: mode === 'projected' ? srcItem.proyectado : 0,
            real: 0,
          });
          added++;
        }
      }
    }
    
    await dbPut('months', monthData);
    modal.remove();
    showToast(`✓ ${added} ítems copiados desde ${MESES_LABEL[MESES.indexOf(sourceMes)]}`, 'success');
    renderMonthlyView(currentMonth); // Re-render
  });
}

// ─── MONTH TABS ─────────────────────────────────────────
function renderMonthTabs(activeMes) {
  const container = $('#month-tabs');
  if (!container) return;
  
  container.innerHTML = MESES.map((mes, i) => {
    const isActive = mes === activeMes;
    return `<button class="month-tab ${isActive ? 'month-tab--active' : ''}" 
                    data-mes="${mes}">${MESES_SHORT[i]}</button>`;
  }).join('');
  
  // Event listeners
  container.querySelectorAll('.month-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      navigate('mes', btn.dataset.mes);
    });
  });
  
  // Scroll al tab activo
  const activeTab = container.querySelector('.month-tab--active');
  if (activeTab) {
    activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}

// ─── TOGGLE PROYECTADO / REAL ───────────────────────────
function renderToggle() {
  const toggle = $('#toggle-mode');
  if (!toggle) return;
  
  toggle.querySelectorAll('.toggle-group__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.mode;
      try { localStorage.setItem('misCuentas.viewMode', viewMode); } catch { /* ignore */ }
      toggle.querySelectorAll('.toggle-group__btn').forEach(b => {
        b.classList.toggle('toggle-group__btn--active', b.dataset.mode === viewMode);
      });
      // Re-renderizar las secciones que dependen del modo
      renderResult();
      renderIngresos();
      renderEgresos();
      renderDistribucion();
    });
  });
}

// ─── RESULTADO DEL MES ──────────────────────────────────
function renderResult() {
  const container = $('#section-result');
  if (!container) return;
  
  const totalIngresos = calcTotalIngresos(monthData.ingresos, viewMode);
  const totalEgresos = calcTotalEgresos(monthData.egresos, viewMode);
  const totalInversion = calcTotalMovimientosCapital(monthData.egresos, viewMode);
  const restante = calcRestante(totalIngresos, totalEgresos, dolarCCL);
  const isPositive = restante.ars >= 0;
  const formatDolarLocal = (v) => `$${Number(v||0).toLocaleString('es-AR', {minimumFractionDigits:2})}`;

  // Indicador de la fuente del dólar del mes (Cambio 3)
  let dolarTag = '';
  let dolarBadge = '';
  if (dolarInfo?.fuente === 'manual') {
    dolarTag = 'Valor manual (fijado por vos)';
    dolarBadge = '<span class="badge badge--warning" style="font-size:9px;padding:1px 5px">manual</span>';
  } else if (dolarInfo?.fuente === 'promedio') {
    const n = dolarInfo.dias;
    dolarTag = `Promedio de ${n} día${n !== 1 ? 's' : ''}`;
  } else {
    dolarTag = 'Estimado (sin capturas del mes)';
  }
  
  container.innerHTML = `
    <div class="result-card">
      <div class="result-card__item">
        <div class="result-card__label" title="${dolarTag}">Dólar CCL ${dolarBadge}</div>
        <div class="result-card__value" style="color:var(--color-info-text);font-size:var(--font-size-lg)">${formatDolarLocal(dolarCCL)}</div>
        <div class="result-card__sub" style="font-size:var(--font-size-xs);color:var(--color-text-muted)">${dolarTag}</div>
        <button class="btn btn--ghost btn--sm" id="btn-edit-dolar-mes" style="font-size:var(--font-size-xs);padding:2px 8px;margin-top:4px">✏️ Editar</button>
      </div>
      <div class="result-card__item">
        <div class="result-card__label">Ingresos</div>
        <div class="result-card__value text-success">${formatARS(totalIngresos)}</div>
        <div class="result-card__sub">${formatUSD(calcIngresosUSD(totalIngresos, dolarCCL))}</div>
      </div>
      <div class="result-card__item">
        <div class="result-card__label">Egresos</div>
        <div class="result-card__value text-danger">${formatARS(totalEgresos)}</div>
      </div>
      <div class="result-card__item">
        <div class="result-card__label">💰 Inversión</div>
        <div class="result-card__value" style="color:var(--color-capital-text)">${formatARS(totalInversion)}</div>
        <div class="result-card__sub">${formatUSD(calcIngresosUSD(totalInversion, dolarCCL))}</div>
      </div>
      <div class="result-card__item">
        <div class="result-card__label">Restante</div>
        <div class="result-card__value ${isPositive ? 'result-card__value--positive' : 'result-card__value--negative'}">
          ${formatARS(restante.ars)}
        </div>
        <div class="result-card__sub">${formatUSD(restante.usd)}</div>
        ${totalInversion > 0 ? `<div class="result-card__sub" style="opacity:.75">líquido ${formatARS(restante.ars - totalInversion)} + inversión ${formatARS(totalInversion)}</div>` : ''}
      </div>
    </div>
  `;

  // Override manual del dólar de este mes (Cambio 3)
  $('#btn-edit-dolar-mes')?.addEventListener('click', async () => {
    const mesLabel = MESES_LABEL[MESES.indexOf(currentMonth)];
    const actual = dolarInfo?.fuente === 'manual' ? dolarCCL : '';
    const val = prompt(
      `Dólar manual para ${mesLabel}\n(vacío = usar el promedio automático del mes):`,
      actual
    );
    if (val === null) return;
    const trimmed = String(val).trim();
    if (trimmed === '') {
      await setDolarManualForMonth(currentMonthKey, null);
      showToast(`${mesLabel}: vuelve al promedio automático`, 'success');
    } else {
      const n = parseNumber(val);
      if (!(n > 0)) return;
      await setDolarManualForMonth(currentMonthKey, n);
      showToast(`Dólar manual de ${mesLabel}: $${n.toLocaleString('es-AR', {minimumFractionDigits:2})}`, 'success');
    }
    dolarCCL = await getDolarCCL(currentMonthKey);
    dolarInfo = await getMonthDolarInfo(currentMonthKey);
    renderResult();
  });
}

// ─── INGRESOS ───────────────────────────────────────────
function renderIngresos() {
  const container = $('#section-ingresos');
  if (!container) return;
  
  const totalProy = calcTotalIngresos(monthData.ingresos, 'proyectado');
  const totalReal = calcTotalIngresos(monthData.ingresos, 'real');
  const totalHoras = calcTotalHoras(monthData.ingresos);
  const total = viewMode === 'proyectado' ? totalProy : totalReal;
  
  container.innerHTML = `
    <div class="card">
      <div class="section__header">
        <h2 class="section__title">
          <span>💼</span> Ingresos
        </h2>
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          ${totalHoras > 0 ? `<span class="hours-summary">🕐 ${formatHours(totalHoras)}</span>` : ''}
          <span class="badge badge--success">${formatUSD(calcIngresosUSD(total, dolarCCL))}</span>
        </div>
      </div>
      <div class="income-table-wrap">
        <table class="data-table income-table" id="income-table">
          <thead>
            <tr>
              <th class="col-desc">Descripción</th>
              <th class="col-amount text-right">Proyectado</th>
              <th class="col-amount text-right">Real</th>
              <th class="col-hours text-right">Hs/sem</th>
              <th class="col-hours text-right">Hs/mes</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody id="income-tbody"></tbody>
          <tfoot>
            <tr class="data-table--total">
              <td><strong>TOTAL</strong></td>
              <td class="text-right"><strong>${formatARS(totalProy)}</strong></td>
              <td class="text-right"><strong>${formatARS(totalReal)}</strong></td>
              <td class="text-right" colspan="2"><strong>${formatHours(totalHoras)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button class="add-item-btn" id="btn-add-income">
        <span>+</span> Agregar ingreso
      </button>
    </div>
  `;
  
  // Renderizar filas
  const tbody = $('#income-tbody');
  monthData.ingresos.forEach((item) => {
    tbody.appendChild(buildIncomeRowDOM(item));
  });
  
  // Agregar ingreso
  $('#btn-add-income').addEventListener('click', () => {
    const newItem = {
      id: generateId(),
      descripcion: '',
      proyectado: 0,
      real: 0,
      horasSemanales: '',
      horasMensuales: '',
      horasTotal: '',
    };
    monthData.ingresos.push(newItem);
    tbody.appendChild(buildIncomeRowDOM(newItem));
    debouncedSave();
    // Focus en la descripción del nuevo ítem
    const lastRow = tbody.lastElementChild;
    const firstCell = lastRow.querySelector('.editable-cell__display');
    if (firstCell) firstCell.click();
  });
}

function buildIncomeRowDOM(item) {
  const tr = createElement('tr', { dataset: { id: item.id } });
  
  const fields = [
    { value: item.descripcion, type: 'text', field: 'descripcion', format: v => v || '', className: '' },
    { value: item.proyectado, type: 'number', field: 'proyectado', format: v => formatARS(v), className: 'text-right' },
    { value: item.horasSemanales, type: 'text', field: 'horasSemanales', format: v => v || '—', className: 'text-right' },
    { value: item.horasMensuales, type: 'text', field: 'horasMensuales', format: v => v || '—', className: 'text-right' },
  ];
  
  let colIndex = 0;
  for (const f of fields) {
    if (colIndex === 2) {
      // Insert "Real" cell before horasSemanales
      const tdReal = createElement('td', { className: 'text-right' });
      const displayReal = createElement('div', { className: 'editable-cell__display', style: { cursor: 'pointer', color: 'var(--color-info-text)' } }, [formatARS(item.real)]);
      displayReal.addEventListener('click', () => openTransactionModal(item, null, 'ingreso'));
      tdReal.appendChild(displayReal);
      tr.appendChild(tdReal);
    }
    const td = createElement('td', { className: f.className });
    td.appendChild(buildEditableCell(
      f.format(f.value),
      f.type,
      (val) => {
        if (f.type === 'number') {
          item[f.field] = parseNumber(val);
        } else {
          item[f.field] = val;
        }
        debouncedSave();
        refreshAfterEdit();
      },
      f.type === 'number' ? item[f.field] : f.value
    ));
    tr.appendChild(td);
    colIndex++;
  }
  
  // Recurrente + Delete buttons
  const tdActions = createElement('td', { style: { whiteSpace: 'nowrap' } });
  
  // Recurrente toggle (F5)
  const recBtn = createElement('button', {
    className: 'row-action',
    title: 'Marcar como recurrente',
    'aria-label': 'Toggle recurrente',
    style: { opacity: '0.4', cursor: 'pointer', background: 'none', border: 'none', fontSize: 'var(--font-size-sm)', padding: '2px' },
  }, ['🔄']);
  checkRecurringState(item.id, 'ingreso', null, recBtn);
  recBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRecurring(item, 'ingreso', null, recBtn);
  });
  tdActions.appendChild(recBtn);
  
  const delBtn = createElement('button', {
    className: 'row-delete',
    title: 'Eliminar',
    'aria-label': 'Eliminar ingreso',
  }, ['✕']);
  delBtn.addEventListener('click', () => {
    const idx = monthData.ingresos.findIndex(i => i.id === item.id);
    if (idx > -1) {
      monthData.ingresos.splice(idx, 1);
      tr.remove();
      debouncedSave();
      refreshAfterEdit();
      showToast('Ingreso eliminado', 'info');
    }
  });
  tdActions.appendChild(delBtn);
  tr.appendChild(tdActions);
  
  return tr;
}

// ─── EGRESOS ────────────────────────────────────────────
function renderEgresos() {
  const container = $('#section-egresos');
  if (!container) return;

  const totalEgresos = calcTotalEgresos(monthData.egresos, viewMode);
  const totalInversion = calcTotalMovimientosCapital(monthData.egresos, viewMode);
  const categoriasGasto = CATEGORIAS_EGRESO.filter(c => !c.esTransferencia);
  const categoriasCapital = CATEGORIAS_EGRESO.filter(c => c.esTransferencia);

  container.innerHTML = `
    <div class="section__header">
      <h2 class="section__title">
        <span>🏷️</span> Egresos
      </h2>
      <span class="badge badge--danger">${formatARS(totalEgresos)}</span>
    </div>
    <div class="expenses-section" id="expenses-container"></div>
    ${categoriasCapital.length ? `
      <div class="section__header" style="margin-top:var(--space-5)">
        <h2 class="section__title">
          <span>💰</span> Inversión / Movimiento de Capital
        </h2>
        <span class="badge" id="badge-inversion" style="background:var(--color-capital-subtle);color:var(--color-capital-text)">${formatARS(totalInversion)}</span>
      </div>
      <div class="expenses-section expenses-section--capital" id="expenses-capital-container"></div>
    ` : ''}
  `;

  const expContainer = $('#expenses-container');

  // Renderizar cada categoría de gasto como sección colapsable
  for (const cat of categoriasGasto) {
    const catData = monthData.egresos[cat.id] || { items: [] };
    expContainer.appendChild(buildCategorySection(cat, catData));
  }

  // Categorías de movimiento de capital: aparte, no cuentan como gasto
  const capitalContainer = $('#expenses-capital-container');
  if (capitalContainer) {
    for (const cat of categoriasCapital) {
      const catData = monthData.egresos[cat.id] || { items: [] };
      capitalContainer.appendChild(buildCategorySection(cat, catData));
    }
  }
}

function buildCategorySection(category, catData) {
  const subtotal = calcSubtotalCategoria(catData, viewMode);
  
  const section = createElement('div', {
    className: 'collapsible',
    dataset: { catId: category.id },
  });
  
  // Header
  const header = createElement('div', { className: 'collapsible__header' });
  header.innerHTML = `
    <div class="collapsible__header-left">
      <span class="collapsible__category-num">${category.id}</span>
      <span class="collapsible__title">${category.icon} ${category.nombre}</span>
    </div>
    <span class="collapsible__subtotal">${formatARS(subtotal)}</span>
    <span class="collapsible__chevron">▼</span>
  `;
  
  header.addEventListener('click', () => {
    section.classList.toggle('collapsible--open');
  });
  
  // Body
  const body = createElement('div', { className: 'collapsible__body' });
  const content = createElement('div', { className: 'collapsible__content' });
  
  // Table
  const tableWrap = createElement('div', { style: { overflowX: 'auto' } });
  const table = createElement('table', { className: 'data-table expense-category-table' });
  
  const thead = createElement('thead');
  thead.innerHTML = `
    <tr>
      <th class="col-num">Nº</th>
      <th class="col-desc">Descripción</th>
      <th class="col-amount text-right">Proyectado</th>
      <th class="col-amount text-right">Real</th>
      <th class="col-actions"></th>
    </tr>
  `;
  table.appendChild(thead);
  
  const tbody = createElement('tbody');
  catData.items.forEach((item, idx) => {
    tbody.appendChild(buildExpenseRowDOM(item, idx + 1, category.id));
  });
  table.appendChild(tbody);
  
  tableWrap.appendChild(table);
  content.appendChild(tableWrap);
  
  // Add item button
  const addBtn = createElement('button', { className: 'add-item-btn' }, ['+  Agregar gasto']);
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const newItem = {
      id: generateId(),
      descripcion: '',
      proyectado: 0,
      real: 0,
    };
    // Asegurar que la categoría existe en los datos
    if (!monthData.egresos[category.id]) {
      monthData.egresos[category.id] = { items: [] };
    }
    monthData.egresos[category.id].items.push(newItem);
    const newRow = buildExpenseRowDOM(newItem, monthData.egresos[category.id].items.length, category.id);
    tbody.appendChild(newRow);
    debouncedSave();
    // Focus en descripción
    const firstCell = newRow.querySelector('.editable-cell__display');
    if (firstCell) firstCell.click();
  });
  content.appendChild(addBtn);
  
  body.appendChild(content);
  section.appendChild(header);
  section.appendChild(body);
  
  return section;
}

function buildExpenseRowDOM(item, num, categoryId) {
  const tr = createElement('tr', { dataset: { id: item.id } });
  
  // Nº
  const tdNum = createElement('td', { className: 'text-muted' }, [String(num)]);
  tr.appendChild(tdNum);
  
  // Descripción
  const tdDesc = createElement('td');
  tdDesc.appendChild(buildEditableCell(
    item.descripcion || '',
    'text',
    (val) => {
      item.descripcion = val;
      debouncedSave();
    },
    item.descripcion
  ));
  tr.appendChild(tdDesc);
  
  // Proyectado
  const tdProy = createElement('td', { className: 'text-right' });
  tdProy.appendChild(buildEditableCell(
    formatARS(item.proyectado),
    'number',
    (val) => {
      item.proyectado = parseNumber(val);
      debouncedSave();
      refreshAfterEdit();
    },
    item.proyectado
  ));
  tr.appendChild(tdProy);
  
  // Real (no es inline editable, abre modal de transacciones)
  const tdReal = createElement('td', { className: 'text-right' });
  const displayReal = createElement('div', { 
    className: 'editable-cell__display', 
    style: { cursor: 'pointer', color: 'var(--color-info-text)' } 
  }, [formatARS(item.real)]);
  displayReal.addEventListener('click', () => openTransactionModal(item, categoryId, 'egreso'));
  tdReal.appendChild(displayReal);
  tr.appendChild(tdReal);
  
  // Actions: Recurrente + Delete
  const tdActions = createElement('td', { style: { whiteSpace: 'nowrap' } });
  
  // Recurrente toggle (F5)
  const recBtn = createElement('button', {
    className: 'row-action',
    title: 'Marcar como recurrente',
    style: { opacity: '0.4', cursor: 'pointer', background: 'none', border: 'none', fontSize: 'var(--font-size-sm)', padding: '2px' },
  }, ['🔄']);
  checkRecurringState(item.id, 'egreso', categoryId, recBtn);
  recBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleRecurring(item, 'egreso', categoryId, recBtn);
  });
  tdActions.appendChild(recBtn);
  
  const delBtn = createElement('button', {
    className: 'row-delete',
    title: 'Eliminar',
  }, ['✕']);
  delBtn.addEventListener('click', () => {
    const items = monthData.egresos[categoryId]?.items;
    if (items) {
      const idx = items.findIndex(i => i.id === item.id);
      if (idx > -1) {
        items.splice(idx, 1);
        tr.remove();
        debouncedSave();
        refreshAfterEdit();
        showToast('Gasto eliminado', 'info');
      }
    }
  });
  tdActions.appendChild(delBtn);
  tr.appendChild(tdActions);
  
  return tr;
}

// ─── RECURRING TOGGLE (F5) ─────────────────────────────
async function checkRecurringState(itemId, tipo, categoryId, btn) {
  try {
    const all = await dbGetAll('recurring');
    const found = all.find(r => r.sourceDesc === itemId || r.id === `rec-${itemId}`);
    if (found && found.activo !== false) {
      btn.style.opacity = '1';
      btn.title = 'Recurrente activo';
    }
  } catch { /* ignore */ }
}

async function toggleRecurring(item, tipo, categoryId, btn) {
  const recId = `rec-${item.id}`;
  const existing = await dbGet('recurring', recId);
  
  if (existing) {
    // Remove recurring
    await dbDelete('recurring', recId);
    btn.style.opacity = '0.4';
    btn.title = 'Marcar como recurrente';
    showToast(`"${item.descripcion}" ya no es recurrente`, 'info');
  } else {
    // Add recurring
    const rec = {
      id: recId,
      sourceDesc: item.id,
      tipo,
      categoryId: categoryId || null,
      descripcion: item.descripcion,
      proyectado: item.proyectado || 0,
      horasSemanales: item.horasSemanales || '',
      horasMensuales: item.horasMensuales || '',
      activo: true,
    };
    await dbPut('recurring', rec);
    btn.style.opacity = '1';
    btn.title = 'Recurrente activo';
    showToast(`"${item.descripcion}" marcado como recurrente 🔄`, 'success');
  }
}

// ─── DISTRIBUCIÓN IDEAL ─────────────────────────────────
function renderDistribucion() {
  const container = $('#section-distribucion');
  if (!container) return;
  
  const distribucion = configData?.distribucionIdeal;
  if (!distribucion) return;
  
  const rows = calcDistribucionIdeal(monthData.egresos, distribucion, viewMode);
  
  container.innerHTML = `
    <div class="card">
      <h2 class="card__title">
        <span class="card__title-icon">🎯</span>
        Distribución Ideal
      </h2>
      <div class="distribution-wrap">
        <table class="ideal-table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th class="text-right">% Ideal</th>
              <th class="text-right">Monto Proy.</th>
              <th class="text-right">Monto Real</th>
              <th class="text-right">% Proy.</th>
              <th class="text-right">% Real</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="font-weight:500">${r.nombre}</td>
                <td class="text-right text-muted">${formatPercent(r.percentIdeal, 0)}</td>
                <td class="text-right">${formatARS(r.montoProyectado)}</td>
                <td class="text-right">${formatARS(r.montoReal)}</td>
                <td class="text-right">${formatPercent(r.percentProyectado)}</td>
                <td class="text-right">${formatPercent(r.percentReal)}</td>
                <td>
                  <div class="semaforo semaforo--${r.semaforo}">
                    <span class="semaforo__dot"></span>
                    <span style="font-size:var(--font-size-xs)">
                      ${r.semaforo === 'ok' ? 'OK' : r.semaforo === 'warning' ? 'Alerta' : 'Excedido'}
                    </span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── EDITABLE CELL (componente inline) ──────────────────
function buildEditableCell(displayValue, type, onChange, rawValue) {
  const wrapper = createElement('div', { className: 'editable-cell' });
  
  const display = createElement('div', {
    className: 'editable-cell__display',
    tabindex: '0',
  }, [String(displayValue || '—')]);
  
  wrapper.appendChild(display);
  
  const startEdit = () => {
    // Crear input
    const input = createElement('input', {
      type: type === 'number' ? 'text' : 'text',
      className: 'editable-cell__input',
      value: type === 'number' ? (rawValue || 0) : (rawValue || ''),
    });
    
    // Reemplazar display con input
    display.style.display = 'none';
    wrapper.appendChild(input);
    input.focus();
    input.select();
    
    const finishEdit = () => {
      const newVal = input.value;
      if (onChange) onChange(newVal);
      
      // Actualizar display
      if (type === 'number') {
        display.textContent = formatARS(parseNumber(newVal));
        rawValue = parseNumber(newVal);
      } else {
        display.textContent = newVal || '—';
        rawValue = newVal;
      }
      
      display.style.display = '';
      input.remove();
    };
    
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        display.style.display = '';
        input.remove();
      }
    });
  };
  
  display.addEventListener('click', startEdit);
  display.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEdit();
    }
  });
  
  return wrapper;
}

// ─── HELPERS ────────────────────────────────────────────

/**
 * Refresca los totales y la distribución después de una edición.
 */
function refreshAfterEdit() {
  renderResult();
  renderDistribucion();
  // Actualizar subtotales de las categorías
  updateCategorySubtotals();
  // Actualizar badge total de egresos
  updateEgresosTotal();
  // Actualizar badge total de ingresos
  updateIngresosTotal();
}

function updateCategorySubtotals() {
  const sections = $$('.collapsible[data-cat-id]');
  sections.forEach(section => {
    const catId = section.dataset.catId;
    const catData = monthData.egresos[catId];
    if (catData) {
      const subtotal = calcSubtotalCategoria(catData, viewMode);
      const subtotalEl = section.querySelector('.collapsible__subtotal');
      if (subtotalEl) {
        subtotalEl.textContent = formatARS(subtotal);
      }
    }
  });
}

function updateEgresosTotal() {
  const totalEgresos = calcTotalEgresos(monthData.egresos, viewMode);
  const badge = document.querySelector('#section-egresos .badge');
  if (badge) {
    badge.textContent = formatARS(totalEgresos);
  }
  const badgeInversion = document.getElementById('badge-inversion');
  if (badgeInversion) {
    badgeInversion.textContent = formatARS(calcTotalMovimientosCapital(monthData.egresos, viewMode));
  }
}

function updateIngresosTotal() {
  const total = viewMode === 'proyectado' 
    ? calcTotalIngresos(monthData.ingresos, 'proyectado')
    : calcTotalIngresos(monthData.ingresos, 'real');
  const badge = document.querySelector('#section-ingresos .badge');
  if (badge) {
    badge.textContent = formatUSD(calcIngresosUSD(total, dolarCCL));
  }
}

/**
 * Guarda los datos del mes en IndexedDB.
 *
 * La vista Mes sólo edita campos "proyectado", descripciones y estructura.
 * Los campos derivados `real` (que son propiedad del sistema de transacciones)
 * y `dolarCCL` (propiedad del servicio de dólar) NO deben pisarse con la copia
 * en memoria, que puede estar desactualizada si una transacción o la captura
 * del dólar promedio se guardaron mientras esta vista estaba abierta.
 * Por eso, antes de escribir, releemos el mes de la DB y conservamos esos
 * valores autoritativos.
 */
async function saveMonthData() {
  if (!monthData || !currentMonthKey) return;

  const dbMonth = await dbGet('months', currentMonthKey);
  if (dbMonth) {
    // Preservar dólar promedio capturado por el servicio de dólar.
    if (dbMonth.dolarCCL != null) {
      monthData.dolarCCL = dbMonth.dolarCCL;
    }

    // Preservar `real` de ingresos (match por id).
    if (Array.isArray(monthData.ingresos) && Array.isArray(dbMonth.ingresos)) {
      const realById = new Map(dbMonth.ingresos.map(i => [i.id, i.real]));
      for (const item of monthData.ingresos) {
        if (realById.has(item.id)) item.real = realById.get(item.id);
      }
    }

    // Preservar `real` de egresos (por categoría, match por id de ítem).
    if (monthData.egresos && dbMonth.egresos) {
      for (const catId of Object.keys(monthData.egresos)) {
        const dbCat = dbMonth.egresos[catId];
        const memCat = monthData.egresos[catId];
        if (!dbCat || !Array.isArray(dbCat.items) || !Array.isArray(memCat?.items)) continue;
        const realById = new Map(dbCat.items.map(i => [i.id, i.real]));
        for (const item of memCat.items) {
          if (realById.has(item.id)) item.real = realById.get(item.id);
        }
      }
    }
  }

  await dbPut('months', monthData);
}

// ─── MODAL DE TRANSACCIONES ──────────────────────────────
async function openTransactionModal(item, categoryId, type) {
  const existingModal = document.getElementById('tx-modal');
  if (existingModal) existingModal.remove();
  
  const modal = createElement('div', {
    id: 'tx-modal',
    className: 'modal fade-in',
  });
  
  modal.innerHTML = `
    <div class="modal__content" style="max-width:500px;width:95%">
      <div class="modal__header">
        <h3 class="modal__title">Detalle Real: ${item.descripcion}</h3>
        <button class="modal__close" id="btn-close-tx">✕</button>
      </div>
      <div class="modal__body" id="tx-modal-body">
        <div style="text-align:center;padding:var(--space-4)">Cargando transacciones...</div>
      </div>
      <div class="modal__footer" style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:600">Total: ${formatARS(item.real)}</div>
        <button class="btn btn--primary" id="btn-add-tx-modal">Agregar +</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on clicking overlay background
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  
  $('#btn-close-tx').addEventListener('click', () => modal.remove());
  
  // Agregar atajo al Quick Add
  $('#btn-add-tx-modal').addEventListener('click', () => {
    modal.remove();
    navigate('quick-add'); 
  });
  
  // Load transactions
  await loadTransactionsInModal(item, categoryId, type);
}

async function loadTransactionsInModal(item, categoryId, type) {
  const body = $('#tx-modal-body');
  if (!body) return;
  
  const txs = await getTransactionsForItem(item.id);
  
  if (txs.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:var(--space-6) 0">
        <div class="empty-state__text">No hay transacciones registradas.</div>
      </div>
    `;
    return;
  }
  
  body.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Nota</th>
          <th class="text-right">Monto</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${txs.map(t => `
          <tr>
            <td class="text-muted" style="font-size:var(--font-size-xs)">${new Date(t.date).toLocaleDateString('es-AR')}</td>
            <td>${t.note || '—'}</td>
            <td class="text-right font-semibold">${formatARS(t.amount)}</td>
            <td class="text-right">
              <button class="row-delete btn-delete-tx" data-id="${t.id}" title="Eliminar">✕</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  body.querySelectorAll('.btn-delete-tx').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('¿Eliminar esta transacción?')) {
        const tId = btn.dataset.id;
        const tx = txs.find(t => t.id === tId);
        if (tx) {
          btn.textContent = '...';
          await deleteTransaction(tx);
          // Reload monthData as item.real changed
          monthData = await dbGet('months', currentMonthKey);
          // Find updated item to show new total
          const updatedTxs = await getTransactionsForItem(item.id);
          item.real = updatedTxs.reduce((sum, x) => sum + x.amount, 0);
          
          await loadTransactionsInModal(item, categoryId, type);
          
          // Re-render UI
          document.querySelector('#tx-modal .modal__footer div').textContent = `Total: ${formatARS(item.real)}`;
          refreshAfterEdit();
          // Update the table cell
          const tr = document.querySelector(`tr[data-id="${item.id}"]`);
          if (tr) {
            const display = tr.querySelector('.editable-cell__display[style*="cursor: pointer"]');
            if (display) display.textContent = formatARS(item.real);
          }
        }
      }
    });
  });
}
