/**
 * MIS CUENTAS — Bottom Navigation
 */

import { navigate, getCurrentRoute } from '../router.js';
import { ROUTES, MESES } from '../utils/constants.js';

/**
 * Renderiza la barra de navegación inferior.
 */
export function renderNav() {
  const nav = document.getElementById('app-nav');
  nav.className = 'bottom-nav';
  nav.innerHTML = `
    <button class="bottom-nav__item" data-route="${ROUTES.QUICK_ADD}" id="nav-quick-add">
      <span class="bottom-nav__icon">➕</span>
      <span>Cargar</span>
    </button>
    <button class="bottom-nav__item" data-route="${ROUTES.DASHBOARD}" id="nav-dashboard">
      <span class="bottom-nav__icon">📊</span>
      <span>Dashboard</span>
    </button>
    <button class="bottom-nav__item" data-route="${ROUTES.MONTHLY}" id="nav-monthly">
      <span class="bottom-nav__icon">📅</span>
      <span>Mes</span>
    </button>
    <button class="bottom-nav__item" data-route="${ROUTES.SEARCH}" id="nav-search">
      <span class="bottom-nav__icon">🔍</span>
      <span>Buscar</span>
    </button>
    <button class="bottom-nav__item" data-route="${ROUTES.SETTINGS}" id="nav-settings">
      <span class="bottom-nav__icon">⚙️</span>
      <span>Config</span>
    </button>
  `;

  // Event listeners
  nav.querySelectorAll('.bottom-nav__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const route = btn.dataset.route;
      if (route === ROUTES.MONTHLY) {
        // Ir al mes actual
        const mesActual = MESES[new Date().getMonth()];
        const currentRoute = getCurrentRoute();
        // Si ya estamos en un mes, quedarnos ahí
        if (currentRoute.view === ROUTES.MONTHLY && currentRoute.param) {
          navigate(ROUTES.MONTHLY, currentRoute.param);
        } else {
          navigate(ROUTES.MONTHLY, mesActual);
        }
      } else {
        navigate(route);
      }
    });
  });
}

/**
 * Actualiza el estado activo de la navegación según la ruta actual.
 * @param {{ view: string, param: string|null }} route
 */
export function updateNavActive(route) {
  const items = document.querySelectorAll('.bottom-nav__item');
  items.forEach(item => {
    item.classList.toggle(
      'bottom-nav__item--active',
      item.dataset.route === route.view
    );
  });
}
