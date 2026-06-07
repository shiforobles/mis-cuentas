/**
 * MIS CUENTAS — Header component
 * Con selector de año para multi-año.
 */

import { $, createElement } from '../utils/helpers.js';
import { navigate } from '../router.js';
import { ROUTES } from '../utils/constants.js';
import { dbGet, dbPut } from '../db/database.js';
import { seedYear } from '../db/seed.js';
import { isSupabaseConfigured } from '../services/supabase.js';

/**
 * Renderiza el header de la app con selector de año.
 */
export async function renderHeader() {
  const header = document.getElementById('app-header');
  header.className = 'app-header';

  const config = await dbGet('config', 'global');
  const año = config?.año || 2026;

  header.innerHTML = `
    <a href="#/${ROUTES.DASHBOARD}" class="app-header__brand" id="header-brand">
      <span class="app-header__brand-icon">💰</span>
      <span class="app-header__brand-text">Mis Cuentas</span>
    </a>
    <div class="app-header__center">
      <button class="year-nav__btn" id="btn-year-prev" aria-label="Año anterior">◀</button>
      <span class="year-nav__label" id="year-label">${año}</span>
      <button class="year-nav__btn" id="btn-year-next" aria-label="Año siguiente">▶</button>
    </div>
    <div class="app-header__actions">
      ${isSupabaseConfigured() ? `<button class="btn btn--ghost btn--icon" id="btn-sync-status" title="Sincronización" aria-label="Estado de sincronización">☁️</button>` : ''}
      <button class="btn btn--ghost btn--icon" id="btn-theme" title="Cambiar tema" aria-label="Cambiar tema">
        🌙
      </button>
    </div>
  `;

  // Year navigation
  $('#btn-year-prev', header).addEventListener('click', () => changeYear(año - 1));
  $('#btn-year-next', header).addEventListener('click', () => changeYear(año + 1));

  // Theme toggle
  const themeBtn = $('#btn-theme', header);
  themeBtn.addEventListener('click', toggleTheme);

  // Indicador de sincronización
  if (isSupabaseConfigured()) setupSyncIndicator();

  updateThemeButton();
}

/** Mapa de estado de sync → ícono, color y texto del indicador del header. */
const SYNC_VIEW = {
  disabled: { icon: '☁️', color: 'var(--color-text-muted)', label: 'Sync desactivado' },
  offline:  { icon: '📴', color: 'var(--color-text-muted)', label: 'Sin conexión' },
  syncing:  { icon: '🔄', color: 'var(--color-info-text)', label: 'Sincronizando…' },
  pending:  { icon: '🟡', color: 'var(--color-warning-text, #d97706)', label: 'Cambios sin sincronizar' },
  synced:   { icon: '✅', color: 'var(--color-success-text)', label: 'Sincronizado' },
  error:    { icon: '⚠️', color: 'var(--color-danger-text)', label: 'Error de sync' },
  merge:    { icon: '🔀', color: 'var(--color-warning-text, #d97706)', label: 'Sincronización inicial pendiente' },
};

/** Conecta el botón del header al estado de sync (ícono + click para sincronizar). */
async function setupSyncIndicator() {
  const btn = $('#btn-sync-status');
  if (!btn) return;
  const sync = await import('../services/sync.js');

  sync.onSyncStatus(({ status, info }) => {
    const b = document.getElementById('btn-sync-status');
    if (!b) return;
    const v = SYNC_VIEW[status] || SYNC_VIEW.disabled;
    b.textContent = v.icon;
    b.style.color = v.color;
    b.title = info || v.label;
    b.style.animation = status === 'syncing' ? 'spin 1s linear infinite' : '';
  });

  btn.addEventListener('click', async () => {
    const { status } = sync.getSyncStatus();
    if (status === 'merge') { navigate(ROUTES.SETTINGS); return; } // resolver el primer merge en Config
    sync.autoSync();
  });
}

/**
 * Cambia el año activo: seed meses del nuevo año y recargar.
 * @param {number} nuevoAño
 */
async function changeYear(nuevoAño) {
  if (nuevoAño < 2020 || nuevoAño > 2050) return;

  const config = await dbGet('config', 'global');
  if (config) {
    config.año = nuevoAño;
    await dbPut('config', config);
  }

  // Seed meses del nuevo año si no existen
  await seedYear(nuevoAño);

  // Recargar la app para reflejar el cambio
  window.location.reload();
}

/**
 * Alterna entre modo claro y oscuro.
 */
async function toggleTheme() {
  const config = await dbGet('config', 'global');
  const currentTheme = config?.theme || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', newTheme);
  
  if (config) {
    config.theme = newTheme;
    await dbPut('config', config);
  }
  
  updateThemeButton();
}

/**
 * Actualiza el icono del botón de tema.
 */
async function updateThemeButton() {
  const config = await dbGet('config', 'global');
  const theme = config?.theme || 'dark';
  const btn = $('#btn-theme');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Aplica el tema guardado.
 */
export async function applyTheme() {
  const config = await dbGet('config', 'global');
  const theme = config?.theme || 'dark';
  document.documentElement.setAttribute('data-theme', theme);
}
