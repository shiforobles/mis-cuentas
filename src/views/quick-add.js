/**
 * MIS CUENTAS — Vista de Captura Rápida (Mobile)
 * Flujo de carga de gastos/ingresos optimizado para celular.
 */

import { dbGet } from '../db/database.js';
import { saveTransaction } from '../services/transactions.js';
import { calcTotalIngresos, calcTotalEgresos } from '../services/calculations.js';
import { formatARS, parseNumber } from '../utils/format.js';
import { MESES, CATEGORIAS_EGRESO, mesKey } from '../utils/constants.js';
import { $, showToast, generateId } from '../utils/helpers.js';

let currentMonthKey = null;
let monthData = null;

let flowState = {
  type: null, // 'egreso' | 'ingreso'
  step: 0,    // 0: home, 1: monto, 2: categoria, 3: item
  amount: 0,
  categoryId: null,
  itemId: null,
  note: ''
};

export async function renderQuickAdd() {
  const main = document.getElementById('app-main');
  
  const config = await dbGet('config', 'global');
  const año = config?.año || 2026;
  const mesActual = MESES[new Date().getMonth()];
  currentMonthKey = mesKey(mesActual, año);
  monthData = await dbGet('months', currentMonthKey);
  
  if (!monthData) {
    main.innerHTML = `<div class="empty-state">Error: No se encontraron datos para el mes en curso.</div>`;
    return;
  }
  
  const ingresosReales = calcTotalIngresos(monthData.ingresos, 'real');
  const egresosReales = calcTotalEgresos(monthData.egresos, 'real');
  const restante = ingresosReales - egresosReales;
  
  main.innerHTML = `
    <div class="quick-add-view fade-in">
      
      <div id="quick-add-home" class="quick-add-step active">
        <div class="quick-add-header">
          <h2 style="font-size:var(--font-size-sm);color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:1px;margin-bottom:var(--space-2)">Restante del mes</h2>
          <div class="quick-add-restante ${restante >= 0 ? 'text-success' : 'text-danger'}" style="font-size:var(--font-size-3xl);font-weight:800;line-height:1">
            ${formatARS(restante)}
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)">
            Gastado: ${formatARS(egresosReales)}
          </div>
        </div>
        
        <div class="quick-add-actions" style="display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-8)">
          <button id="btn-start-egreso" class="btn btn--danger" style="padding:var(--space-4);font-size:var(--font-size-xl);border-radius:16px;box-shadow:0 10px 25px rgba(239, 68, 68, 0.2)">
            ➖ NUEVO GASTO
          </button>
          <button id="btn-start-ingreso" class="btn btn--success" style="padding:var(--space-4);font-size:var(--font-size-xl);border-radius:16px;box-shadow:0 10px 25px rgba(34, 197, 94, 0.2)">
            ➕ NUEVO INGRESO
          </button>
        </div>
      </div>

      <!-- Paso 1: Monto -->
      <div id="quick-add-amount" class="quick-add-step" style="display:none">
        <div style="display:flex;align-items:center;margin-bottom:var(--space-6)">
          <button id="btn-back-1" class="btn btn--ghost" style="padding:var(--space-2)">⬅ Volver</button>
          <h2 style="flex:1;text-align:center;font-size:var(--font-size-lg)" id="qa-amount-title">Ingresá el monto</h2>
        </div>
        <div style="text-align:center;margin-bottom:var(--space-6)">
          <span style="font-size:var(--font-size-3xl);font-weight:800;color:var(--color-text-secondary)">$</span>
          <input type="text" id="qa-amount-input" inputmode="numeric" placeholder="0" 
                 style="font-size:var(--font-size-3xl);font-weight:800;background:transparent;border:none;color:var(--color-text);width:60%;text-align:center;outline:none;border-bottom:2px solid var(--color-primary)">
        </div>
        <button id="btn-next-amount" class="btn btn--primary" style="width:100%;padding:var(--space-4);font-size:var(--font-size-lg)">Siguiente ➡</button>
      </div>

      <!-- Paso 2: Categoría (solo egresos) -->
      <div id="quick-add-category" class="quick-add-step" style="display:none">
        <div style="display:flex;align-items:center;margin-bottom:var(--space-6)">
          <button id="btn-back-2" class="btn btn--ghost" style="padding:var(--space-2)">⬅ Volver</button>
          <h2 style="flex:1;text-align:center;font-size:var(--font-size-lg)">Elegí Categoría</h2>
        </div>
        <div class="qa-category-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
          ${CATEGORIAS_EGRESO.map(cat => `
            <button class="btn btn--secondary qa-cat-btn" data-id="${cat.id}" style="padding:var(--space-4) var(--space-2);display:flex;flex-direction:column;gap:var(--space-2);height:100px;justify-content:center;border-radius:12px">
              <span style="font-size:var(--font-size-xl)">${cat.icon}</span>
              <span style="font-size:var(--font-size-xs);white-space:normal;line-height:1.2">${cat.nombre}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Paso 3: Ítem y Guardar -->
      <div id="quick-add-item" class="quick-add-step" style="display:none">
        <div style="display:flex;align-items:center;margin-bottom:var(--space-4)">
          <button id="btn-back-3" class="btn btn--ghost" style="padding:var(--space-2)">⬅ Volver</button>
          <h2 style="flex:1;text-align:center;font-size:var(--font-size-lg)">Seleccioná el ítem</h2>
        </div>
        
        <div id="qa-item-list" style="display:flex;flex-direction:column;gap:var(--space-2);max-height:50vh;overflow-y:auto;margin-bottom:var(--space-4)">
          <!-- Lista generada dinámicamente -->
        </div>
        
        <div style="margin-bottom:var(--space-4)">
          <input type="text" id="qa-note-input" class="form-input" placeholder="Nota opcional (ej: super Coto)..." style="width:100%">
        </div>
        
        <button id="btn-save-tx" class="btn btn--primary" style="width:100%;padding:var(--space-4);font-size:var(--font-size-lg)" disabled>Guardar $0</button>
      </div>
      
    </div>
  `;
  
  bindEvents();
}

function bindEvents() {
  // Flujo Home
  $('#btn-start-egreso').addEventListener('click', () => startFlow('egreso'));
  $('#btn-start-ingreso').addEventListener('click', () => startFlow('ingreso'));
  
  // Back buttons
  $('#btn-back-1').addEventListener('click', () => showStep(0));
  $('#btn-back-2').addEventListener('click', () => showStep(1));
  $('#btn-back-3').addEventListener('click', () => {
    if (flowState.type === 'egreso') showStep(2);
    else showStep(1); // Ingreso saltea categoría
  });
  
  // Amount input format — sin límite de dígitos, formato de miles en vivo
  const amountInput = $('#qa-amount-input');
  amountInput.addEventListener('input', (e) => {
    // Strip everything except digits
    let raw = e.target.value.replace(/\D/g, '');
    if (raw) {
      e.target.value = new Intl.NumberFormat('es-AR').format(Number(raw));
    } else {
      e.target.value = '';
    }
  });
  
  // Amount Next
  $('#btn-next-amount').addEventListener('click', async () => {
    const val = parseNumber(amountInput.value);
    if (val <= 0) {
      showToast('Ingresá un monto válido', 'warning');
      return;
    }
    flowState.amount = val;
    $('#btn-save-tx').textContent = `Guardar ${formatARS(val)}`;
    
    if (flowState.type === 'egreso') {
      showStep(2); // ir a categorías
    } else {
      await loadItems(null); // ingresos no tienen categoría
      showStep(3); // ir directo a ítems
    }
  });
  
  // Categorías
  document.querySelectorAll('.qa-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      flowState.categoryId = parseInt(btn.dataset.id, 10);
      await loadItems(flowState.categoryId);
      showStep(3);
    });
  });
  
  // Guardar
  $('#btn-save-tx').addEventListener('click', handleSave);
}

function startFlow(type) {
  flowState = { type, step: 1, amount: 0, categoryId: null, itemId: null, note: '' };
  $('#qa-amount-input').value = '';
  $('#qa-note-input').value = '';
  $('#btn-save-tx').disabled = true;
  $('#qa-amount-title').textContent = type === 'egreso' ? 'Ingresá el gasto' : 'Ingresá el ingreso';
  $('#qa-amount-title').style.color = type === 'egreso' ? 'var(--color-danger)' : 'var(--color-success)';
  
  showStep(1);
  setTimeout(() => $('#qa-amount-input').focus(), 100);
}

function showStep(stepNum) {
  document.querySelectorAll('.quick-add-step').forEach(el => el.style.display = 'none');
  const steps = ['quick-add-home', 'quick-add-amount', 'quick-add-category', 'quick-add-item'];
  $('#' + steps[stepNum]).style.display = 'block';
  flowState.step = stepNum;
}

async function loadItems(categoryId) {
  const container = $('#qa-item-list');
  let items = [];
  
  if (flowState.type === 'ingreso') {
    items = [...monthData.ingresos];
  } else {
    items = [...(monthData.egresos[categoryId]?.items || [])];
  }
  
  // Sort by frequency: count transactions per item
  try {
    const { dbGetTransactionsByMonth } = await import('../db/database.js');
    const txs = await dbGetTransactionsByMonth(currentMonthKey);
    const freq = {};
    txs.forEach(tx => { freq[tx.itemId] = (freq[tx.itemId] || 0) + 1; });
    items.sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0));
  } catch { /* fallback: original order */ }
  
  container.innerHTML = items.map(item => `
    <div class="card card--interactive qa-item-row" data-id="${item.id}" style="padding:var(--space-3);display:flex;justify-content:space-between">
      <span style="font-weight:600">${item.descripcion}</span>
      <span class="text-muted" style="font-size:var(--font-size-xs)">Real: ${formatARS(item.real)}</span>
    </div>
  `).join('');
  
  container.innerHTML += `
    <div class="card card--interactive qa-item-row qa-item-new" data-new="true" style="padding:var(--space-3);border:1px dashed var(--color-primary);color:var(--color-primary);text-align:center">
      ➕ Agregar nuevo ítem...
    </div>
  `;
  
  // Bind items
  container.querySelectorAll('.qa-item-row:not(.qa-item-new)').forEach(row => {
    row.addEventListener('click', () => {
      container.querySelectorAll('.qa-item-row').forEach(r => r.style.borderColor = 'transparent');
      row.style.borderColor = 'var(--color-primary)';
      flowState.itemId = row.dataset.id;
      $('#btn-save-tx').disabled = false;
    });
  });
  
  // Bind new item
  container.querySelector('.qa-item-new').addEventListener('click', async () => {
    const name = prompt('Nombre del nuevo ítem:');
    if (name && name.trim()) {
      // Create new item on the fly
      const newItem = {
        id: generateId(),
        descripcion: name.trim(),
        proyectado: 0,
        real: 0
      };
      
      // Save it to monthData so it's available
      if (flowState.type === 'ingreso') {
        monthData.ingresos.push(newItem);
      } else {
        if (!monthData.egresos[categoryId]) monthData.egresos[categoryId] = { items: [] };
        monthData.egresos[categoryId].items.push(newItem);
      }
      
      // Persistir el ítem ANTES de que se guarde la transacción: si no se
      // espera (await), recalculateItemReal puede leer el mes sin el ítem y
      // dejar el "real" en 0 (la transacción queda guardada pero no suma).
      const { dbPut } = await import('../db/database.js');
      await dbPut('months', monthData);

      flowState.itemId = newItem.id;
      await loadItems(categoryId); // re-render list
      
      // Select the newly added item
      const newRow = container.querySelector(`[data-id="${newItem.id}"]`);
      if (newRow) {
        newRow.style.borderColor = 'var(--color-primary)';
        $('#btn-save-tx').disabled = false;
      }
    }
  });
}

async function handleSave() {
  if (!flowState.itemId || flowState.amount <= 0) return;
  
  flowState.note = $('#qa-note-input').value.trim();
  
  const btn = $('#btn-save-tx');
  btn.textContent = 'Guardando...';
  btn.disabled = true;
  
  try {
    await saveTransaction({
      mesId: currentMonthKey,
      type: flowState.type,
      categoryId: flowState.categoryId,
      itemId: flowState.itemId,
      amount: flowState.amount,
      note: flowState.note
    });
    
    showToast('✓ Transacción guardada con éxito', 'success');
    renderQuickAdd(); // Reload home view to show updated totals
  } catch (error) {
    console.error(error);
    showToast('Error al guardar', 'error');
    btn.textContent = 'Reintentar';
    btn.disabled = false;
  }
}
