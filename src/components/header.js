/**
 * MIS CUENTAS — Header component
 * Con selector de año para multi-año.
 */

import { $, createElement } from '../utils/helpers.js';
import { navigate } from '../router.js';
import { ROUTES } from '../utils/constants.js';
import { dbGet, dbPut } from '../db/database.js';
import { seedYear } from '../db/seed.js';

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

  updateThemeButton();
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
