/**
 * MIS CUENTAS — Vista de Búsqueda (F2)
 * Buscar transacciones y egresos por texto, categoría, monto y mes.
 */

import { dbGet, dbGetAll } from '../db/database.js';
import { formatARS, parseNumber } from '../utils/format.js';
import { MESES, MESES_SHORT, MESES_LABEL, CATEGORIAS_EGRESO, mesKey } from '../utils/constants.js';
import { $, debounce, showToast } from '../utils/helpers.js';
import { navigate } from '../router.js';

export async function renderSearch() {
  const main = document.getElementById('app-main');
  const config = await dbGet('config', 'global');
  const año = config?.año || 2026;

  // Load all months
  const allMonths = [];
  for (const mes of MESES) {
    const m = await dbGet('months', mesKey(mes, año));
    allMonths.push({ mesId: mes, data: m });
  }

  // Load all transactions
  let allTx = [];
  try { allTx = await dbGetAll('transactions'); } catch { /* */ }

  // Build searchable index
  const searchIndex = buildSearchIndex(allMonths, allTx, año);

  main.innerHTML = `
    <div class="search-view fade-in">
      <h1 class="search-title">🔍 Buscar</h1>

      <!-- Search input -->
      <div class="search-bar">
        <span class="search-bar__icon">🔍</span>
        <input type="text" class="search-bar__input" id="search-input"
               placeholder="Buscar gastos, ingresos..." autocomplete="off" />
      </div>

      <!-- Filters -->
      <div class="search-filters" id="search-filters">
        <button class="btn btn--ghost btn--sm" id="btn-toggle-filters" style="width:100%;margin-bottom:var(--space-3)">
          🎛️ Filtros avanzados ▼
        </button>
        <div class="search-filters__body" id="filters-body" style="display:none">
          <!-- Type filter -->
          <div style="margin-bottom:var(--space-3)">
            <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-2)">TIPO</div>
            <div class="chip-group">
              <button class="chip chip--active" data-type="todos">Todos</button>
              <button class="chip" data-type="egreso">Egresos</button>
              <button class="chip" data-type="ingreso">Ingresos</button>
            </div>
          </div>
          <!-- Category filter -->
          <div style="margin-bottom:var(--space-3)">
            <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-2)">CATEGORÍA</div>
            <div class="chip-group" id="cat-chips">
              ${CATEGORIAS_EGRESO.map(c => `<button class="chip" data-cat="${c.id}">${c.icon} ${c.nombre}</button>`).join('')}
            </div>
          </div>
          <!-- Amount range -->
          <div style="margin-bottom:var(--space-3)">
            <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-2)">MONTO</div>
            <div style="display:flex;gap:var(--space-2);align-items:center">
              <input class="form-field__input" type="text" id="filter-min" placeholder="Mín" style="width:100px;padding:var(--space-2)" />
              <span style="color:var(--color-text-muted)">—</span>
              <input class="form-field__input" type="text" id="filter-max" placeholder="Máx" style="width:100px;padding:var(--space-2)" />
            </div>
          </div>
          <!-- Month filter -->
          <div>
            <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);margin-bottom:var(--space-2)">MES</div>
            <div class="chip-group" id="month-chips">
              ${MESES_SHORT.map((m, i) => `<button class="chip" data-month="${i}">${m}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div id="search-results"></div>

      <!-- Summary -->
      <div class="search-summary" id="search-summary" style="display:none"></div>
    </div>
  `;

  // State
  let filters = { query: '', type: 'todos', categories: [], minAmount: 0, maxAmount: Infinity, months: [] };

  const doSearch = debounce(() => {
    const results = filterResults(searchIndex, filters);
    renderResults(results);
  }, 200);

  // Search input
  $('#search-input').addEventListener('input', (e) => {
    filters.query = e.target.value.toLowerCase().trim();
    doSearch();
  });

  // Toggle filters
  $('#btn-toggle-filters').addEventListener('click', () => {
    const body = $('#filters-body');
    const isOpen = body.style.display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    $('#btn-toggle-filters').textContent = isOpen ? '🎛️ Filtros avanzados ▼' : '🎛️ Filtros avanzados ▲';
  });

  // Type chips
  document.querySelectorAll('[data-type]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-type]').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
      filters.type = chip.dataset.type;
      doSearch();
    });
  });

  // Category chips (multi-select)
  document.querySelectorAll('[data-cat]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('chip--active');
      filters.categories = [...document.querySelectorAll('[data-cat].chip--active')].map(c => parseInt(c.dataset.cat));
      doSearch();
    });
  });

  // Month chips (multi-select)
  document.querySelectorAll('[data-month]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('chip--active');
      filters.months = [...document.querySelectorAll('[data-month].chip--active')].map(c => parseInt(c.dataset.month));
      doSearch();
    });
  });

  // Amount filters
  ['filter-min', 'filter-max'].forEach(id => {
    $(`#${id}`).addEventListener('input', () => {
      filters.minAmount = parseNumber($('#filter-min').value) || 0;
      const max = parseNumber($('#filter-max').value);
      filters.maxAmount = max > 0 ? max : Infinity;
      doSearch();
    });
  });

  // Initial render (show all)
  renderResults(searchIndex);
}

function buildSearchIndex(allMonths, allTx, año) {
  const index = [];

  for (let i = 0; i < allMonths.length; i++) {
    const { mesId, data } = allMonths[i];
    if (!data) continue;

    // Ingresos
    for (const item of (data.ingresos || [])) {
      const txs = allTx.filter(t => t.itemId === item.id);
      const amount = item.real || txs.reduce((s, t) => s + t.amount, 0);
      index.push({
        tipo: 'ingreso', mesIdx: i, mesId,
        mesLabel: MESES_LABEL[i],
        categoryId: null, categoryName: 'Ingresos', categoryIcon: '💼',
        descripcion: item.descripcion,
        amount, proyectado: item.proyectado || 0,
        txCount: txs.length,
        notes: txs.map(t => t.note).filter(Boolean),
        loadedAt: itemLoadedAt(txs),
      });
    }

    // Egresos
    for (const cat of CATEGORIAS_EGRESO) {
      const catData = data.egresos?.[cat.id];
      if (!catData?.items) continue;
      for (const item of catData.items) {
        const txs = allTx.filter(t => t.itemId === item.id);
        const amount = item.real || txs.reduce((s, t) => s + t.amount, 0);
        index.push({
          tipo: 'egreso', mesIdx: i, mesId,
          mesLabel: MESES_LABEL[i],
          categoryId: cat.id, categoryName: cat.nombre, categoryIcon: cat.icon,
          descripcion: item.descripcion,
          amount, proyectado: item.proyectado || 0,
          txCount: txs.length,
          notes: txs.map(t => t.note).filter(Boolean),
          loadedAt: itemLoadedAt(txs),
        });
      }
    }
  }

  return index;
}

/**
 * Timestamp de "orden de carga" de una fila de búsqueda (un ítem de movimiento):
 * la transacción más reciente cargada en ese ítem (lo último que registró el
 * usuario ahí). Devuelve 0 si el ítem no tiene transacciones — esas filas son
 * solo proyectadas (nunca se cargó un movimiento) y van debajo de todo lo
 * cargado (ver sortResults), sin competir con los movimientos reales.
 * @param {Array<{createdAt?: string, date?: string}>} txs
 * @returns {number} milisegundos epoch, o 0 si no hay transacciones
 */
function itemLoadedAt(txs) {
  let max = 0;
  for (const t of txs) {
    const ts = Date.parse(t.createdAt || t.date || '');
    if (!isNaN(ts) && ts > max) max = ts;
  }
  return max;
}

function filterResults(index, filters) {
  return index.filter(item => {
    if (filters.type !== 'todos' && item.tipo !== filters.type) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(item.categoryId)) return false;
    if (filters.months.length > 0 && !filters.months.includes(item.mesIdx)) return false;
    const amt = item.amount || item.proyectado;
    if (amt < filters.minAmount) return false;
    if (amt > filters.maxAmount) return false;
    if (filters.query) {
      const haystack = [item.descripcion, item.categoryName, item.mesLabel, ...item.notes].join(' ').toLowerCase();
      if (!haystack.includes(filters.query)) return false;
    }
    return true;
  });
}

/**
 * Modo de orden de los resultados de Buscar.
 * Por ahora único: 'carga' (lo último cargado, arriba). La estructura queda
 * lista para sumar 'fecha' / 'monto' con un selector en el futuro, sin tocar
 * el resto de la vista.
 */
const SORT_MODE = 'carga';

/**
 * Ordena (in place) los resultados según el modo activo.
 * @param {Array} results
 * @param {'carga'|'fecha'|'monto'} [mode=SORT_MODE]
 */
function sortResults(results, mode = SORT_MODE) {
  switch (mode) {
    case 'monto':
      results.sort((a, b) => (b.amount || b.proyectado) - (a.amount || a.proyectado));
      break;
    case 'fecha':
      results.sort((a, b) => b.mesIdx - a.mesIdx);
      break;
    case 'carga':
    default:
      // 1º las filas con movimientos cargados (lo último arriba), 2º las solo
      // proyectadas (sin carga) debajo, ordenadas por mes reciente y monto.
      results.sort((a, b) =>
        (b.loadedAt > 0) - (a.loadedAt > 0) ||
        (b.loadedAt - a.loadedAt) ||
        (b.mesIdx - a.mesIdx) ||
        (b.amount || b.proyectado) - (a.amount || a.proyectado)
      );
      break;
  }
}

function renderResults(results) {
  const container = $('#search-results');
  const summary = $('#search-summary');
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--space-8) 0">
      <div class="empty-state__icon">🔍</div>
      <div class="empty-state__text">No se encontraron resultados</div>
    </div>`;
    if (summary) summary.style.display = 'none';
    return;
  }

  sortResults(results);
  const displayed = results.slice(0, 100);

  container.innerHTML = `<div class="search-results-list">
    ${displayed.map(item => {
      const amt = item.amount || item.proyectado;
      const isEgreso = item.tipo === 'egreso';
      return `<div class="search-result-row" data-mes="${item.mesId}" style="cursor:pointer">
        <div class="search-result-row__left">
          <span class="search-result-row__icon">${item.categoryIcon}</span>
          <div>
            <div class="search-result-row__desc">${highlightMatch(item.descripcion, $('#search-input')?.value || '')}</div>
            <div class="search-result-row__meta">${item.mesLabel} · ${item.categoryName}${item.notes.length > 0 ? ` · <span class="text-muted">${item.notes[0]}</span>` : ''}</div>
          </div>
        </div>
        <div class="search-result-row__amount ${isEgreso ? 'text-danger' : 'text-success'}">${isEgreso ? '-' : '+'}${formatARS(amt)}</div>
      </div>`;
    }).join('')}
  </div>`;

  container.querySelectorAll('.search-result-row').forEach(row => {
    row.addEventListener('click', () => navigate('mes', row.dataset.mes));
  });

  const totalEgresos = results.filter(r => r.tipo === 'egreso').reduce((s, r) => s + (r.amount || r.proyectado), 0);
  const totalIngresos = results.filter(r => r.tipo === 'ingreso').reduce((s, r) => s + (r.amount || r.proyectado), 0);

  if (summary) {
    summary.style.display = 'flex';
    summary.innerHTML = `
      <span>${results.length} resultado${results.length !== 1 ? 's' : ''}</span>
      <span>Egresos: <strong class="text-danger">${formatARS(totalEgresos)}</strong></span>
      <span>Ingresos: <strong class="text-success">${formatARS(totalIngresos)}</strong></span>
    `;
  }
}

function highlightMatch(text, query) {
  if (!query || !text) return text || '';
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}
