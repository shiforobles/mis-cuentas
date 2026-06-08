/**
 * MIS CUENTAS — Vista de Configuración
 * Editar % ideales, categorías, dólar, año, importar/exportar, gastos recurrentes.
 */

import { dbGet, dbPut, dbGetAll, dbDelete, exportAllData, importAllData, resetUserData } from '../db/database.js';
import { getDolarCCL, setDolarManual, saveDolarToMonth } from '../services/dollar.js';
import { formatARS, formatUSD, formatDolar, formatPercent, parseNumber } from '../utils/format.js';
import { CATEGORIAS_EGRESO, MESES, mesKey } from '../utils/constants.js';
import { $, showToast, debounce, generateId, escapeHtml } from '../utils/helpers.js';
import { isSupabaseConfigured, signIn, signUp, signOut, getCurrentUser, onAuthChange } from '../services/supabase.js';

let configData = null;
let portfolioData = null;

/**
 * Renderiza la vista de configuración.
 */
export async function renderSettings() {
  const main = document.getElementById('app-main');
  
  configData = await dbGet('config', 'global');
  portfolioData = await dbGet('portfolio', 'current');
  const dolarCCL = await getDolarCCL();
  
  main.innerHTML = `
    <div class="settings-view fade-in">
      <h1 class="settings-title">⚙️ Configuración</h1>

      <!-- Cuenta / Sincronización -->
      <div class="settings-group">
        <h2 class="settings-group__title">☁️ Cuenta y sincronización</h2>
        <div id="account-section"></div>
      </div>

      <!-- Año -->
      <div class="settings-group">
        <h2 class="settings-group__title">📅 Año de trabajo</h2>
        <div class="form-field">
          <label class="form-field__label" for="config-year">Año</label>
          <input class="form-field__input" type="number" id="config-year" 
                 value="${configData?.año || 2026}" min="2020" max="2050" />
          <div class="form-field__hint">Usá las flechas ◀ ▶ del header para navegar entre años.</div>
        </div>
      </div>
      
      <!-- Dólar -->
      <div class="settings-group">
        <h2 class="settings-group__title">💵 Dólar CCL</h2>
        <div class="form-field">
          <label class="form-field__label">Valor actual</label>
          <div style="font-size:var(--font-size-lg);font-weight:700;color:var(--color-info-text);margin-bottom:var(--space-3)">
            ${formatDolar(dolarCCL)}
          </div>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="config-dolar-manual">Override manual (dejá vacío para usar la API)</label>
          <input class="form-field__input" type="text" id="config-dolar-manual" 
                 value="${configData?.dolarCCLManual || ''}" 
                 placeholder="Ej: 1500" />
          <div class="form-field__hint">Si cargás un valor, se usa ese en vez de la API. Borralo para volver al automático.</div>
        </div>
      </div>
      
      <!-- Distribución Ideal -->
      <div class="settings-group">
        <h2 class="settings-group__title">🎯 Distribución Ideal (%)</h2>
        <div class="form-field__hint" style="margin-bottom:var(--space-3)">
          Porcentaje objetivo de cada categoría sobre el total de egresos. Debe sumar ~100%.
        </div>
        <div id="ideal-percentages"></div>
        <div style="margin-top:var(--space-3);font-size:var(--font-size-sm);color:var(--color-text-secondary)">
          Total: <strong id="ideal-total">0%</strong>
        </div>
      </div>

      <!-- Gastos Recurrentes (F5) -->
      <div class="settings-group">
        <h2 class="settings-group__title">🔄 Gastos Recurrentes</h2>
        <div class="form-field__hint" style="margin-bottom:var(--space-3)">
          Los ítems recurrentes se agregan automáticamente al crear un mes nuevo.
        </div>
        <div id="recurring-list"></div>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-3);flex-wrap:wrap">
          <button class="btn btn--primary btn--sm" id="btn-add-recurring">➕ Agregar recurrente</button>
          <button class="btn btn--secondary btn--sm" id="btn-import-recurring">📥 Importar del mes actual</button>
        </div>
      </div>
      
      <!-- Cartera -->
      <div class="settings-group">
        <h2 class="settings-group__title">💼 Cartera (montos totales)</h2>
        <div class="form-field__hint" style="margin-bottom:var(--space-3)">
          Cargá los montos totales de tu cartera. Podés renombrar conceptos, cambiar la moneda (ARS/US$), agregar y eliminar. Los valores en US$ se cargan directamente en dólares.
        </div>
        <div id="portfolio-fields"></div>

        <h3 style="font-size:var(--font-size-sm);font-weight:600;margin:var(--space-5) 0 var(--space-2);color:var(--color-text-secondary)">🎯 Asignación objetivo</h3>
        <div class="form-field__hint" style="margin-bottom:var(--space-3)">
          Definí tu objetivo de cartera. El dashboard te avisa si te desviás más de 5 puntos.
        </div>
        <div id="portfolio-targets"></div>

        <h3 style="font-size:var(--font-size-sm);font-weight:600;margin:var(--space-5) 0 var(--space-2);color:var(--color-text-secondary)">🛡️ Fondo de emergencia</h3>
        <div class="form-field__hint" style="margin-bottom:var(--space-3)">
          Elegí qué concepto de Liquidez es tu fondo. El dashboard te muestra cuántos meses de gastos cubre (objetivo: 3 meses).
        </div>
        <div id="portfolio-emergencia"></div>

        <h3 style="font-size:var(--font-size-sm);font-weight:600;margin:var(--space-5) 0 var(--space-2);color:var(--color-text-secondary)">📸 Snapshot de cartera</h3>
        <div class="form-field__hint" style="margin-bottom:var(--space-3)">
          Guardá una foto del estado actual de tu cartera para ver la evolución de tu patrimonio en el dashboard → Patrimonio. Hay una foto por mes (si volvés a guardar, reemplaza la del mes).
        </div>
        <button class="btn btn--secondary" id="btn-snapshot-cartera" style="width:100%">📸 Guardar snapshot de este mes</button>
      </div>

      <!-- Importar / Exportar -->
      <div class="settings-group">
        <h2 class="settings-group__title">📦 Datos</h2>
        <div class="action-list">
          <div class="action-item" id="action-export-json">
            <div class="action-item__left">
              <span class="action-item__icon">💾</span>
              <div>
                <div class="action-item__text">Exportar backup (JSON)</div>
                <div class="action-item__desc">Descargá todos tus datos como archivo JSON</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>
          
          <div class="action-item" id="action-import-json">
            <div class="action-item__left">
              <span class="action-item__icon">📂</span>
              <div>
                <div class="action-item__text">Importar backup (JSON)</div>
                <div class="action-item__desc">Restaurá datos desde un archivo JSON</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>
          
          <div class="action-item" id="action-import-excel">
            <div class="action-item__left">
              <span class="action-item__icon">📊</span>
              <div>
                <div class="action-item__text">Importar Excel (.xlsx)</div>
                <div class="action-item__desc">Importá tu archivo de Excel existente</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>
          
          <div class="action-item" id="action-export-excel">
            <div class="action-item__left">
              <span class="action-item__icon">📗</span>
              <div>
                <div class="action-item__text">Exportar a Excel (.xlsx)</div>
                <div class="action-item__desc">Descargá tus datos como archivo Excel</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>
          
          <div class="action-item" id="action-export-pdf">
            <div class="action-item__left">
              <span class="action-item__icon">📄</span>
              <div>
                <div class="action-item__text">Exportar mes a PDF</div>
                <div class="action-item__desc">Generá un PDF del mes actual para imprimir</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>
          
          <div class="action-item" id="action-snapshot">
            <div class="action-item__left">
              <span class="action-item__icon">📸</span>
              <div>
                <div class="action-item__text">Guardar snapshot de cartera</div>
                <div class="action-item__desc">Registra el estado actual de tu cartera para tracking mensual</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>

          <div class="action-item action-item--danger" id="action-reset-data">
            <div class="action-item__left">
              <span class="action-item__icon">🗑️</span>
              <div>
                <div class="action-item__text" style="color:var(--color-danger-text,#ef4444)">Resetear datos</div>
                <div class="action-item__desc">Borra reales, transacciones, dólar y cartera (deja todo en cero). Conserva categorías, % ideales, plantilla y recurrentes.</div>
              </div>
            </div>
            <span class="action-item__arrow">→</span>
          </div>
        </div>
      </div>
      
      <!-- Input file oculto -->
      <input type="file" id="file-input-json" accept=".json" style="display:none" />
      <input type="file" id="file-input-excel" accept=".xlsx,.xls" style="display:none" />
    </div>
  `;
  
  renderIdealPercentages();
  renderPortfolioFields();
  renderPortfolioTargets();
  renderEmergenciaSelector();
  renderRecurringList();
  setupEventListeners();
  renderAccountSection();
}

// ─── CUENTA / SINCRONIZACIÓN (Fase 1: auth + conexión) ──────

/**
 * Renderiza la sección de cuenta según el estado: sin configurar, deslogueado
 * (formulario) o logueado (estado + logout). El sync todavía no está activo
 * en esta fase: solo conecta la cuenta.
 */
async function renderAccountSection() {
  const cont = $('#account-section');
  if (!cont) return;

  // Sin credenciales → la app funciona igual, offline. No mostramos login.
  if (!isSupabaseConfigured()) {
    cont.innerHTML = `
      <div class="form-field__hint">
        Sincronización no configurada. La app funciona normalmente y guarda todo en este dispositivo.
        Para sincronizar entre compu y celular, configurá las credenciales de Supabase (ver <code>.env.example</code>).
      </div>`;
    return;
  }

  const user = await getCurrentUser();

  if (user) {
    cont.innerHTML = `
      <div class="form-field__hint" style="margin-bottom:var(--space-3)">
        Conectado como <strong>${escapeHtml(user.email || 'usuario')}</strong>.
        <span class="badge badge--success" style="margin-left:6px">Cuenta vinculada</span>
      </div>
      <button class="btn btn--primary" id="btn-sync-now" style="width:100%;margin-bottom:var(--space-2)">🔄 Sincronizar ahora</button>
      <button class="btn btn--ghost btn--sm" id="btn-sync-push" style="width:100%;margin-bottom:var(--space-2)">⬆️ Subir mis datos a la nube</button>
      <div id="sync-push-msg" style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-bottom:var(--space-3)"></div>
      <button class="btn btn--secondary" id="btn-auth-logout" style="width:100%">Cerrar sesión</button>`;

    $('#btn-sync-now')?.addEventListener('click', async () => {
      const btn = $('#btn-sync-now');
      const msg = $('#sync-push-msg');
      btn.disabled = true; btn.textContent = 'Sincronizando…';
      if (msg) { msg.textContent = ''; msg.style.color = 'var(--color-text-muted)'; }
      try {
        const sync = await import('../services/sync.js');
        // Primer merge: si la nube ya tiene datos y este equipo nunca mergeó, preguntar.
        if (await sync.isFirstMergePending()) {
          const mode = await showFirstMergeModal();
          if (!mode) { btn.disabled = false; btn.textContent = '🔄 Sincronizar ahora'; return; }
          const r = await sync.firstSync(mode);
          const pulled = r.pull?.pulled || 0, pushed = r.push?.pushed || 0;
          showToast(`☁️ Primer merge (${mode}): ${pushed} subidos, ${pulled} bajados`, 'success');
        } else {
          const r = await sync.syncNow();
          const up = r.push?.pushed || 0, down = r.pull?.pulled || 0, del = r.pull?.deletedLocal || 0;
          if (r.ok) {
            showToast(`🔄 Sincronizado: ↑${up} ↓${down}${del ? ' · '+del+' borrados' : ''}`, 'success');
            if (msg) msg.textContent = `Subidos ${up}, bajados ${down}${del ? ', ' + del + ' borrados localmente' : ''}.`;
          } else {
            if (msg) { msg.style.color = 'var(--color-danger-text)'; msg.textContent = 'Sync con errores — ver consola (F12).'; }
            showToast('Sync con errores', 'error');
          }
          await sync.refreshSyncStatus();
        }
        // Refrescar la vista: el pull pudo cambiar datos locales.
        renderSettings();
      } catch (err) {
        showToast('Error al sincronizar: ' + err.message, 'error');
        btn.disabled = false; btn.textContent = '🔄 Sincronizar ahora';
      }
    });

    $('#btn-sync-push')?.addEventListener('click', async () => {
      const btn = $('#btn-sync-push');
      const msg = $('#sync-push-msg');
      btn.disabled = true; btn.textContent = 'Subiendo…';
      if (msg) msg.textContent = '';
      try {
        const { fullPush } = await import('../services/sync.js');
        const r = await fullPush();
        if (r.ok) {
          if (msg) { msg.textContent = `Listo: ${r.pushed} subidos, ${r.deleted} borrados.`; msg.style.color = 'var(--color-text-muted)'; }
          showToast(`☁️ Datos subidos (${r.pushed})`, 'success');
        } else if (r.reason === 'no-auth') {
          showToast('Iniciá sesión primero', 'warning');
        } else {
          // Mostrar el primer error real + resumen por tabla; el detalle completo
          // queda en la consola (console.table con los 15 registros).
          const fails = r.failures || [];
          const porTabla = fails.reduce((a, f) => { a[f.tabla] = (a[f.tabla] || 0) + 1; return a; }, {});
          const resumen = Object.entries(porTabla).map(([t, n]) => `${t}: ${n}`).join(', ');
          const primero = fails[0];
          if (msg) {
            msg.style.color = 'var(--color-danger-text)';
            msg.innerHTML = `Fallaron ${r.failed} (${escapeHtml(resumen)}).<br>` +
              (primero ? `Ej (${escapeHtml(primero.tabla)}): ${escapeHtml(primero.error || '')}${primero.details ? ' — ' + escapeHtml(primero.details) : ''}<br>` : '') +
              `Detalle completo en la consola (F12).`;
          }
          showToast('Sync con errores — ver detalle abajo / consola', 'error');
        }
      } catch (err) {
        showToast('Error al subir: ' + err.message, 'error');
      }
      btn.disabled = false; btn.textContent = '⬆️ Subir mis datos a la nube';
    });

    $('#btn-auth-logout')?.addEventListener('click', async () => {
      const btn = $('#btn-auth-logout');
      btn.disabled = true; btn.textContent = 'Cerrando…';
      const { error } = await signOut();
      if (error) { showToast('Error al cerrar sesión: ' + error, 'error'); btn.disabled = false; btn.textContent = 'Cerrar sesión'; return; }
      showToast('Sesión cerrada', 'success');
      renderAccountSection();
    });
    return;
  }

  // Deslogueado → formulario email + contraseña (login o crear cuenta).
  cont.innerHTML = `
    <div class="form-field__hint" style="margin-bottom:var(--space-3)">
      Iniciá sesión para sincronizar tus datos entre dispositivos. La app sigue funcionando offline en este dispositivo.
    </div>
    <div class="form-field">
      <label class="form-field__label" for="auth-email">Email</label>
      <input class="form-field__input" type="email" id="auth-email" autocomplete="username" placeholder="vos@email.com" />
    </div>
    <div class="form-field">
      <label class="form-field__label" for="auth-password">Contraseña</label>
      <input class="form-field__input" type="password" id="auth-password" autocomplete="current-password" placeholder="••••••••" />
    </div>
    <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2)">
      <button class="btn btn--primary" id="btn-auth-login" style="flex:1">Iniciar sesión</button>
      <button class="btn btn--ghost" id="btn-auth-signup" style="flex:1">Crear cuenta</button>
    </div>
    <div id="auth-msg" style="font-size:var(--font-size-xs);color:var(--color-text-muted);margin-top:var(--space-2)"></div>`;

  const getCreds = () => ({
    email: $('#auth-email').value.trim(),
    password: $('#auth-password').value,
  });
  const setMsg = (txt, isErr = false) => {
    const m = $('#auth-msg');
    if (m) { m.textContent = txt; m.style.color = isErr ? 'var(--color-danger-text)' : 'var(--color-text-muted)'; }
  };

  $('#btn-auth-login')?.addEventListener('click', async () => {
    const { email, password } = getCreds();
    if (!email || !password) { setMsg('Completá email y contraseña.', true); return; }
    const btn = $('#btn-auth-login'); btn.disabled = true; btn.textContent = 'Entrando…';
    const { user: u, error } = await signIn(email, password);
    if (error) { setMsg(error, true); btn.disabled = false; btn.textContent = 'Iniciar sesión'; return; }
    showToast(`Sesión iniciada (${u?.email || ''})`, 'success');
    renderAccountSection();
  });

  $('#btn-auth-signup')?.addEventListener('click', async () => {
    const { email, password } = getCreds();
    if (!email || !password) { setMsg('Completá email y contraseña.', true); return; }
    const btn = $('#btn-auth-signup'); btn.disabled = true; btn.textContent = 'Creando…';
    const { error, needsConfirm } = await signUp(email, password);
    btn.disabled = false; btn.textContent = 'Crear cuenta';
    if (error) { setMsg(error, true); return; }
    if (needsConfirm) { setMsg('Cuenta creada. Revisá tu email para confirmarla y después iniciá sesión.'); return; }
    showToast('Cuenta creada e iniciada', 'success');
    renderAccountSection();
  });
}

/**
 * Muestra el cartel de "primer merge" cuando hay datos en la nube y en este
 * dispositivo. Devuelve la elección del usuario o null si cancela.
 * @returns {Promise<'cloud'|'local'|'merge'|null>}
 */
function showFirstMergeModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;padding:var(--space-4)';
    overlay.innerHTML = `
      <div class="card" style="max-width:440px;width:100%;padding:var(--space-5)">
        <h3 style="margin:0 0 var(--space-2);font-size:var(--font-size-lg)">☁️ Sincronización inicial</h3>
        <p style="font-size:var(--font-size-sm);color:var(--color-text-secondary);margin-bottom:var(--space-4)">
          Encontramos datos <strong>en la nube</strong> y <strong>en este dispositivo</strong>. ¿Cómo querés resolverlo esta primera vez?
        </p>
        <div style="display:flex;flex-direction:column;gap:var(--space-2)">
          <button class="btn btn--primary" data-merge="cloud">⬇️ Usar los de la nube<br><span style="font-size:var(--font-size-xs);opacity:.8">Reemplaza lo de este dispositivo (recomendado en un 2º equipo)</span></button>
          <button class="btn btn--secondary" data-merge="local">⬆️ Subir los de este dispositivo<br><span style="font-size:var(--font-size-xs);opacity:.8">Manda lo local a la nube</span></button>
          <button class="btn btn--secondary" data-merge="merge">🔀 Combinar (last-write-wins)<br><span style="font-size:var(--font-size-xs);opacity:.8">Gana el cambio más reciente en cada registro</span></button>
          <button class="btn btn--ghost btn--sm" data-merge="">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-merge]');
      if (!btn && e.target !== overlay) return;
      const mode = btn ? btn.dataset.merge : '';
      overlay.remove();
      resolve(mode || null);
    });
  });
}

// ─── RECURRING LIST (F5) ────────────────────────────────

async function renderRecurringList() {
  const container = $('#recurring-list');
  if (!container) return;

  let items = [];
  try { items = await dbGetAll('recurring'); } catch { /* */ }

  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--space-4) 0">
      <div class="empty-state__text" style="font-size:var(--font-size-sm)">No hay ítems recurrentes configurados.</div>
    </div>`;
  } else {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--space-2)">
        ${items.map(r => {
          const cat = r.categoryId ? CATEGORIAS_EGRESO.find(c => c.id === r.categoryId) : null;
          return `
            <div class="card" style="padding:var(--space-3);display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-weight:600;font-size:var(--font-size-sm)">
                  ${r.tipo === 'egreso' ? '🏷️' : '💼'} ${r.descripcion}
                </div>
                <div style="font-size:var(--font-size-xs);color:var(--color-text-tertiary)">
                  ${r.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}${cat ? ` · ${cat.icon} ${cat.nombre}` : ''}
                  ${r.proyectado ? ` · ${formatARS(r.proyectado)}` : ''}
                </div>
              </div>
              <div style="display:flex;gap:var(--space-2);align-items:center">
                <label class="toggle-switch" title="${r.activo !== false ? 'Activo' : 'Inactivo'}">
                  <input type="checkbox" ${r.activo !== false ? 'checked' : ''} data-rec-id="${r.id}" class="rec-toggle">
                  <span class="toggle-switch__slider"></span>
                </label>
                <button class="row-delete rec-delete" data-rec-id="${r.id}" title="Eliminar">✕</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Toggle active/inactive
    container.querySelectorAll('.rec-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const recId = toggle.dataset.recId;
        const rec = await dbGet('recurring', recId);
        if (rec) {
          rec.activo = toggle.checked;
          await dbPut('recurring', rec);
          showToast(toggle.checked ? 'Recurrente activado' : 'Recurrente desactivado', 'info');
        }
      });
    });

    // Delete
    container.querySelectorAll('.rec-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await dbDelete('recurring', btn.dataset.recId);
        showToast('Recurrente eliminado', 'info');
        renderRecurringList();
      });
    });
  }

  // Add recurring button
  $('#btn-add-recurring')?.addEventListener('click', async () => {
    const desc = prompt('Descripción del gasto/ingreso recurrente:');
    if (!desc || !desc.trim()) return;
    const tipo = confirm('¿Es un egreso? (OK = Egreso, Cancelar = Ingreso)') ? 'egreso' : 'ingreso';
    let categoryId = null;
    if (tipo === 'egreso') {
      const catList = CATEGORIAS_EGRESO.map((c, i) => `${i + 1}. ${c.icon} ${c.nombre}`).join('\n');
      const catIdx = parseInt(prompt(`Categoría:\n${catList}`, '1')) - 1;
      if (catIdx >= 0 && catIdx < CATEGORIAS_EGRESO.length) {
        categoryId = CATEGORIAS_EGRESO[catIdx].id;
      }
    }
    const proy = parseNumber(prompt('Monto proyectado (0 si no aplica):', '0'));

    const rec = {
      id: `rec-${generateId()}`,
      tipo,
      categoryId,
      descripcion: desc.trim(),
      proyectado: proy,
      activo: true,
    };
    await dbPut('recurring', rec);
    showToast('Recurrente agregado 🔄', 'success');
    renderRecurringList();
  });

  // Import from current month
  $('#btn-import-recurring')?.addEventListener('click', async () => {
    const año = configData?.año || 2026;
    const mesActual = MESES[new Date().getMonth()];
    const mk = mesKey(mesActual, año);
    const month = await dbGet('months', mk);
    if (!month) { showToast('No hay datos del mes actual', 'warning'); return; }

    let added = 0;
    const existing = await dbGetAll('recurring');
    const existingDescs = existing.map(r => r.descripcion.toLowerCase());

    // Ingresos
    for (const item of month.ingresos) {
      if (item.descripcion && !existingDescs.includes(item.descripcion.toLowerCase())) {
        await dbPut('recurring', {
          id: `rec-${generateId()}`,
          tipo: 'ingreso',
          categoryId: null,
          descripcion: item.descripcion,
          proyectado: item.proyectado || 0,
          horasSemanales: item.horasSemanales || '',
          horasMensuales: item.horasMensuales || '',
          activo: true,
        });
        added++;
      }
    }

    // Egresos
    for (const [catId, catData] of Object.entries(month.egresos)) {
      for (const item of (catData.items || [])) {
        if (item.descripcion && !existingDescs.includes(item.descripcion.toLowerCase())) {
          await dbPut('recurring', {
            id: `rec-${generateId()}`,
            tipo: 'egreso',
            categoryId: parseInt(catId),
            descripcion: item.descripcion,
            proyectado: item.proyectado || 0,
            activo: true,
          });
          added++;
        }
      }
    }

    showToast(`${added} ítems importados como recurrentes`, 'success');
    renderRecurringList();
  });
}

// ─── IDEAL PERCENTAGES ──────────────────────────────────

function renderIdealPercentages() {
  const container = $('#ideal-percentages');
  if (!container || !configData?.distribucionIdeal) return;
  
  const dist = configData.distribucionIdeal;
  
  container.innerHTML = Object.entries(dist).map(([catId, config]) => `
    <div class="form-field" style="margin-bottom:var(--space-2)">
      <div style="display:flex;align-items:center;gap:var(--space-3)">
        <label style="flex:1;font-size:var(--font-size-sm);font-weight:500">${config.nombre}</label>
        <div style="width:80px">
          <input class="form-field__input" type="number" min="0" max="100" step="1"
                 data-cat-id="${catId}" data-field="percentIdeal"
                 value="${config.percent}" 
                 style="text-align:right;padding:var(--space-2)" />
        </div>
        <span style="font-size:var(--font-size-sm);color:var(--color-text-tertiary);width:20px">%</span>
      </div>
    </div>
  `).join('');
  
  updateIdealTotal();
  
  container.querySelectorAll('input[data-field="percentIdeal"]').forEach(input => {
    input.addEventListener('change', async () => {
      const catId = input.dataset.catId;
      const value = parseFloat(input.value) || 0;
      configData.distribucionIdeal[catId].percent = value;
      await dbPut('config', configData);
      updateIdealTotal();
    });
  });
}

function updateIdealTotal() {
  const total = Object.values(configData.distribucionIdeal)
    .reduce((sum, c) => sum + (c.percent || 0), 0);
  const el = $('#ideal-total');
  if (el) {
    el.textContent = `${total}%`;
    el.style.color = Math.abs(total - 100) < 1 
      ? 'var(--color-success-text)' 
      : 'var(--color-warning-text)';
  }
}

// ─── PORTFOLIO FIELDS ───────────────────────────────────

function renderPortfolioFields() {
  const container = $('#portfolio-fields');
  if (!container || !portfolioData) return;

  // Garantizar la forma del objeto (puede faltar una sección tras importar datos viejos)
  if (!portfolioData.liquidez) portfolioData.liquidez = {};
  if (!portfolioData.inversiones) portfolioData.inversiones = {};

  container.innerHTML = `
    ${buildPortfolioSection('liquidez', 'Liquidez')}
    ${buildPortfolioSection('inversiones', 'Inversiones')}
  `;

  // La delegación de eventos se conecta UNA sola vez por contenedor.
  // renderPortfolioFields se vuelve a llamar al agregar/eliminar (solo reescribe
  // innerHTML; el elemento contenedor persiste), así que re-wirear duplicaría
  // los listeners y, p.ej., el toggle de moneda se ejecutaría dos veces.
  if (!container.dataset.pfWired) {
    wirePortfolioEvents(container);
    container.dataset.pfWired = '1';
  }
}

function buildPortfolioSection(section, title) {
  const items = Object.entries(portfolioData[section] || {});
  const rows = items.length
    ? items.map(([key, item]) => buildPortfolioField(key, item, section)).join('')
    : `<div class="text-muted" style="font-size:var(--font-size-xs);padding:var(--space-2) 0">Sin conceptos. Agregá uno con el botón de abajo.</div>`;
  return `
    <h3 style="font-size:var(--font-size-sm);font-weight:600;margin:var(--space-4) 0 var(--space-3);color:var(--color-text-secondary)">${title}</h3>
    ${rows}
    <button class="btn btn--ghost" data-pf-add="${section}"
            style="width:100%;margin-top:var(--space-1);border:1px dashed var(--color-border)">
      ➕ Agregar concepto
    </button>
  `;
}

function buildPortfolioField(key, item, section) {
  const isUSD = item.moneda === 'USD';
  return `
    <div class="portfolio-item" data-pf-section="${section}" data-pf-key="${key}"
         style="display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3);margin-bottom:var(--space-2);border:1px solid var(--color-border);border-radius:var(--radius-md)">
      <div style="display:flex;align-items:center;gap:var(--space-2)">
        <input class="form-field__input" type="text" data-pf-field="label"
               value="${escapeHtml(item.label || '')}" placeholder="Nombre del concepto"
               style="flex:1;font-weight:500;padding:var(--space-2)" />
        <button class="btn btn--ghost btn--icon" data-pf-action="delete" title="Eliminar concepto"
                aria-label="Eliminar concepto" style="color:var(--color-danger-text);flex:0 0 auto">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:var(--space-2)">
        <input class="form-field__input" type="text" data-pf-field="detalle"
               value="${escapeHtml(item.detalle || '')}" placeholder="Detalle (opcional)"
               style="flex:1;font-size:var(--font-size-xs);padding:var(--space-2)" />
        <button class="btn btn--ghost" data-pf-action="currency" title="Cambiar moneda"
                style="flex:0 0 auto;min-width:56px;padding:var(--space-2)">${isUSD ? 'US$' : 'ARS $'}</button>
        <div style="width:120px">
          <input class="form-field__input" type="text" data-pf-field="monto"
                 value="${item.monto || ''}" placeholder="0"
                 style="text-align:right;padding:var(--space-2)" />
        </div>
      </div>
    </div>
  `;
}

/** Guarda la cartera en la DB. */
async function savePortfolio() {
  await dbPut('portfolio', portfolioData);
}

/** Conecta los eventos (delegación) de la sección de cartera editable. */
function wirePortfolioEvents(container) {
  // Edición de campos de texto (label, detalle, monto) — guardar al salir del campo.
  container.addEventListener('change', async (e) => {
    const input = e.target.closest('input[data-pf-field]');
    if (!input) return;
    const row = input.closest('.portfolio-item');
    if (!row) return;
    const { pfSection: section, pfKey: key } = row.dataset;
    const item = portfolioData[section]?.[key];
    if (!item) return;

    const field = input.dataset.pfField;
    if (field === 'monto') {
      item.monto = parseNumber(input.value);
    } else if (field === 'label') {
      item.label = input.value.trim();
    } else if (field === 'detalle') {
      const v = input.value.trim();
      if (v) item.detalle = v; else delete item.detalle;
    }
    await savePortfolio();
    // Si se renombró un concepto de liquidez, refrescar el selector de fondo.
    if (field === 'label' && section === 'liquidez') renderEmergenciaSelector();
    showToast('Cartera actualizada', 'success');
  });

  // Botones: moneda, eliminar, agregar.
  container.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-pf-add]');
    if (addBtn) {
      const section = addBtn.dataset.pfAdd;
      const newKey = generateId();
      portfolioData[section][newKey] = { monto: 0, moneda: 'ARS', label: '' };
      await savePortfolio();
      renderPortfolioFields();
      renderEmergenciaSelector();
      // Enfocar el label del nuevo concepto.
      const newRow = container.querySelector(`.portfolio-item[data-pf-key="${newKey}"] input[data-pf-field="label"]`);
      newRow?.focus();
      return;
    }

    const actionBtn = e.target.closest('[data-pf-action]');
    if (!actionBtn) return;
    const row = actionBtn.closest('.portfolio-item');
    if (!row) return;
    const { pfSection: section, pfKey: key } = row.dataset;
    const item = portfolioData[section]?.[key];
    if (!item) return;

    if (actionBtn.dataset.pfAction === 'currency') {
      item.moneda = item.moneda === 'USD' ? 'ARS' : 'USD';
      actionBtn.textContent = item.moneda === 'USD' ? 'US$' : 'ARS $';
      await savePortfolio();
      showToast('Moneda actualizada', 'success');
    } else if (actionBtn.dataset.pfAction === 'delete') {
      const nombre = item.label || 'este concepto';
      if (!confirm(`¿Eliminar "${nombre}" de la cartera?`)) return;
      delete portfolioData[section][key];
      // Si era el fondo de emergencia designado, limpiar la referencia.
      if (portfolioData.emergenciaKey === key) portfolioData.emergenciaKey = null;
      await savePortfolio();
      renderPortfolioFields();
      renderEmergenciaSelector();
      showToast('Concepto eliminado', 'success');
    }
  });
}

// ─── ASIGNACIÓN OBJETIVO (REBALANCEO) ───────────────────

function renderPortfolioTargets() {
  const container = $('#portfolio-targets');
  if (!container || !portfolioData) return;

  if (!portfolioData.targets) portfolioData.targets = { liquidezPct: 30, usdPct: 50 };
  const t = portfolioData.targets;
  const liq = Number(t.liquidezPct) || 0;
  const usd = Number(t.usdPct) || 0;

  container.innerHTML = `
    ${buildTargetField('liquidezPct', 'Liquidez objetivo', liq, `Inversiones: <strong id="tgt-comp-liquidez">${100 - liq}%</strong>`)}
    ${buildTargetField('usdPct', 'USD objetivo', usd, `ARS: <strong id="tgt-comp-usd">${100 - usd}%</strong>`)}
  `;

  if (!container.dataset.wired) {
    container.addEventListener('change', async (e) => {
      const input = e.target.closest('input[data-target-key]');
      if (!input) return;
      const key = input.dataset.targetKey;
      let val = parseInt(input.value, 10);
      if (!isFinite(val)) val = 0;
      val = Math.min(100, Math.max(0, val));
      input.value = val;
      if (!portfolioData.targets) portfolioData.targets = {};
      portfolioData.targets[key] = val;
      await savePortfolio();
      // Actualizar el complemento mostrado.
      const compId = key === 'liquidezPct' ? 'tgt-comp-liquidez' : 'tgt-comp-usd';
      const comp = document.getElementById(compId);
      if (comp) comp.textContent = `${100 - val}%`;
      showToast('Objetivo actualizado', 'success');
    });
    container.dataset.wired = '1';
  }
}

function buildTargetField(key, label, value, complementHtml) {
  return `
    <div class="form-field" style="margin-bottom:var(--space-3)">
      <div style="display:flex;align-items:center;gap:var(--space-3)">
        <label style="flex:1;font-size:var(--font-size-sm);font-weight:500">${label}</label>
        <div style="width:90px;display:flex;align-items:center;gap:var(--space-1)">
          <input class="form-field__input" type="number" min="0" max="100" step="5"
                 data-target-key="${key}" value="${value}"
                 style="text-align:right;padding:var(--space-2)" />
          <span style="color:var(--color-text-tertiary)">%</span>
        </div>
      </div>
      <div class="text-muted" style="font-size:var(--font-size-xs);margin-top:var(--space-1);text-align:right">${complementHtml}</div>
    </div>
  `;
}

// ─── FONDO DE EMERGENCIA (SELECTOR) ─────────────────────

function renderEmergenciaSelector() {
  const container = $('#portfolio-emergencia');
  if (!container || !portfolioData) return;

  const current = portfolioData.emergenciaKey || '';
  const opciones = Object.entries(portfolioData.liquidez || {})
    .map(([key, item]) => `<option value="${escapeHtml(key)}" ${key === current ? 'selected' : ''}>${escapeHtml(item.label || '(sin nombre)')}</option>`)
    .join('');

  container.innerHTML = `
    <div class="form-field">
      <select class="form-field__input" id="emergencia-select" style="padding:var(--space-2)">
        <option value="" ${current === '' ? 'selected' : ''}>— Ninguno —</option>
        ${opciones}
      </select>
    </div>
  `;

  const select = $('#emergencia-select', container);
  select?.addEventListener('change', async () => {
    portfolioData.emergenciaKey = select.value || null;
    await savePortfolio();
    showToast('Fondo de emergencia actualizado', 'success');
  });
}

// ─── EVENT LISTENERS ────────────────────────────────────

function setupEventListeners() {
  // Año
  const yearInput = $('#config-year');
  if (yearInput) {
    yearInput.addEventListener('change', async () => {
      configData.año = parseInt(yearInput.value) || 2026;
      await dbPut('config', configData);
      showToast('Año actualizado — recargá la página para ver los cambios', 'success');
    });
  }
  
  // Dólar manual
  const dolarInput = $('#config-dolar-manual');
  if (dolarInput) {
    dolarInput.addEventListener('change', async () => {
      const val = dolarInput.value.trim();
      if (val === '') {
        await setDolarManual(null);
        showToast('Override removido, usando API', 'success');
      } else {
        const num = parseNumber(val);
        if (num > 0) {
          await setDolarManual(num);
          showToast(`Dólar manual: ${formatDolar(num)}`, 'success');
        }
      }
    });
  }
  
  // Export JSON
  $('#action-export-json')?.addEventListener('click', async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mis-cuentas-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup descargado', 'success');
    } catch (e) {
      showToast('Error al exportar', 'error');
    }
  });
  
  // Import JSON
  $('#action-import-json')?.addEventListener('click', () => {
    $('#file-input-json')?.click();
  });
  
  $('#file-input-json')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (confirm('¿Importar estos datos? Se reemplazarán todos los datos actuales.')) {
        const res = await importAllData(data);
        if (res?.skipped > 0) {
          showToast(`Importado: ${res.imported} ok, ${res.skipped} descartado(s) por forma inválida (ver consola)`, 'error');
          await new Promise(r => setTimeout(r, 2500)); // que alcance a leerse antes del reload
        } else {
          showToast('Datos importados correctamente', 'success');
        }
        window.location.reload();
      }
    } catch (err) {
      showToast('Error al leer el archivo JSON', 'error');
    }
    e.target.value = '';
  });
  
  // Import Excel
  $('#action-import-excel')?.addEventListener('click', () => {
    $('#file-input-excel')?.click();
  });
  
  $('#file-input-excel')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      
      const result = parseExcelWorkbook(workbook, XLSX);
      
      if (result && confirm(`Se encontraron datos para ${result.mesesEncontrados} meses. ¿Importar?`)) {
        await applyExcelImport(result);
        showToast(`Importados ${result.mesesEncontrados} meses desde Excel`, 'success');
        window.location.reload();
      }
    } catch (err) {
      console.error('Error importando Excel:', err);
      showToast('Error al importar el Excel: ' + err.message, 'error');
    }
    e.target.value = '';
  });
  
  // Export Excel
  $('#action-export-excel')?.addEventListener('click', async () => {
    try {
      showToast('Generando Excel...', 'info');
      const { exportToExcel } = await import('../services/export.js');
      await exportToExcel();
      showToast('Excel descargado', 'success');
    } catch (err) {
      console.error('Error exportando Excel:', err);
      showToast('Error al exportar: ' + err.message, 'error');
    }
  });
  
  // Export PDF
  $('#action-export-pdf')?.addEventListener('click', async () => {
    const mesActual = MESES[new Date().getMonth()];
    const mes = prompt(`¿Qué mes exportar a PDF? (actual: ${mesActual})`, mesActual);
    if (!mes) return;
    try {
      const { exportToPDF } = await import('../services/export.js');
      await exportToPDF(mes.toLowerCase().trim());
    } catch (err) {
      showToast('Error al generar PDF: ' + err.message, 'error');
    }
  });
  
  // Portfolio Snapshot (mismo handler para el botón de "Datos" y el de "Cartera")
  const doSnapshot = async () => {
    try {
      const { snapshotCurrentMonth } = await import('../services/portfolio-history.js');
      const snap = await snapshotCurrentMonth();
      if (snap) {
        const mesCap = snap.mesId.charAt(0).toUpperCase() + snap.mesId.slice(1);
        showToast(`📸 Snapshot de ${mesCap}: ${formatARS(snap.granTotalARS)} / ${formatUSD(snap.granTotalUSD)}`, 'success');
      } else {
        showToast('Cargá datos de cartera primero', 'warning');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  };
  $('#action-snapshot')?.addEventListener('click', doSnapshot);
  $('#btn-snapshot-cartera')?.addEventListener('click', doSnapshot);

  // Resetear datos (destructivo, doble confirmación)
  $('#action-reset-data')?.addEventListener('click', async () => {
    const ok1 = confirm(
      '⚠️ RESETEAR DATOS\n\n' +
      'Esto deja todo EN CERO:\n' +
      '• Borra los montos reales y transacciones\n' +
      '• Borra capturas/historial/override del dólar\n' +
      '• Pone la cartera en cero\n\n' +
      'Se conservan: categorías, % ideales, ítems plantilla (con su proyectado) y recurrentes.\n\n' +
      'Esta acción NO se puede deshacer. ¿Continuar?'
    );
    if (!ok1) return;
    const ok2 = confirm('Última confirmación: ¿seguro que querés resetear todos los datos cargados?');
    if (!ok2) return;

    try {
      await resetUserData();
      showToast('Datos reseteados. Todo en cero.', 'success');
      // Recargar la vista de configuración
      renderSettings();
    } catch (err) {
      console.error('Error reseteando datos:', err);
      showToast('Error al resetear: ' + err.message, 'error');
    }
  });
}

// ─── EXCEL PARSER ───────────────────────────────────────

function parseExcelWorkbook(workbook, XLSX) {
  const sheetNames = workbook.SheetNames;
  let mesesEncontrados = 0;
  const monthsData = {};
  let dashboardData = null;
  
  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const lower = sheetName.toLowerCase();
    
    if (lower.includes('dashboard')) {
      dashboardData = parseDashboardSheet(sheet, XLSX);
      continue;
    }
    
    const foundMes = MESES.find(m => lower.includes(m));
    if (foundMes) {
      monthsData[foundMes] = parseMonthSheet(sheet, XLSX);
      mesesEncontrados++;
    }
  }
  
  return { mesesEncontrados, monthsData, dashboardData };
}

function parseDashboardSheet(sheet, XLSX) {
  try {
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const dolarPorMes = {};
    const mesShort = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    
    for (let r = 0; r < jsonData.length; r++) {
      const row = jsonData[r];
      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c] || '').toLowerCase().trim();
        const mesIdx = MESES.findIndex(m => cellStr === m || cellStr.startsWith(m));
        const mesIdxShort = mesShort.findIndex(m => cellStr === m);
        const idx = mesIdx >= 0 ? mesIdx : mesIdxShort;
        
        if (idx >= 0) {
          for (let dc = c + 1; dc < Math.min(c + 4, row.length); dc++) {
            const val = Number(row[dc]);
            if (val > 100 && val < 100000) {
              dolarPorMes[MESES[idx]] = val;
              break;
            }
          }
          break;
        }
      }
    }
    
    return { raw: jsonData, dolarPorMes };
  } catch {
    return null;
  }
}

function parseMonthSheet(sheet, XLSX) {
  try {
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const egresos = {};
    const ingresos = [];
    
    let currentCatId = null;
    const catMap = {
      'hogar y facturas': 1, 'transporte': 2, 'productividad': 3,
      'crecimiento personal': 4, 'calidad de vida': 5, 'bienestar': 6,
      'deudas': 7, 'inversión': 8, 'inversion': 8,
      'generosidad': 9, 'otros': 10,
    };
    
    for (let r = 0; r < jsonData.length; r++) {
      const row = jsonData[r];
      const colB = String(row[1] || '').trim();
      const catKey = colB.toLowerCase();
      if (catMap[catKey]) {
        currentCatId = catMap[catKey];
        if (!egresos[currentCatId]) egresos[currentCatId] = { items: [] };
        continue;
      }
      
      if (currentCatId && row[2]) {
        const desc = String(row[2] || '').trim();
        if (desc && desc !== '' && !desc.toUpperCase().startsWith('TOTAL')) {
          egresos[currentCatId].items.push({
            id: generateId(),
            descripcion: desc,
            proyectado: parseNumber(String(row[4] || 0)),
            real: parseNumber(String(row[5] || 0)),
          });
        }
      }
    }
    
    for (let r = 6; r < Math.min(20, jsonData.length); r++) {
      const row = jsonData[r];
      const desc = String(row[8] || '').trim();
      if (desc && desc !== '' && !desc.toUpperCase().includes('TOTAL')) {
        ingresos.push({
          id: generateId(),
          descripcion: desc,
          proyectado: parseNumber(String(row[9] || 0)),
          real: parseNumber(String(row[10] || 0)),
          horasSemanales: String(row[11] || ''),
          horasMensuales: String(row[12] || ''),
          horasTotal: String(row[13] || ''),
        });
      }
    }
    
    return { egresos, ingresos };
  } catch (e) {
    console.error('Error parseando hoja mensual:', e);
    return null;
  }
}

async function applyExcelImport(result) {
  const año = configData?.año || 2026;
  const dolarPorMes = result.dashboardData?.dolarPorMes || {};
  
  for (const [mesId, data] of Object.entries(result.monthsData)) {
    if (!data) continue;
    // Use mesKey for year-aware access
    const mk = mesKey(mesId, año);
    const existing = await dbGet('months', mk);
    if (existing) {
      if (data.ingresos.length > 0) existing.ingresos = data.ingresos;
      if (Object.keys(data.egresos).length > 0) existing.egresos = data.egresos;
      if (dolarPorMes[mesId]) {
        // saveDolarToMonth muta y escribe el mes (incluye ingresos/egresos ya
        // aplicados) y sincroniza dolarHistorico en una sola pasada.
        await saveDolarToMonth(mk, dolarPorMes[mesId], existing);
      } else {
        await dbPut('months', existing);
      }
    }
  }
}
