/**
 * MIS CUENTAS — Mini SPA Router (hash-based)
 * Maneja la navegación entre dashboard, meses y configuración.
 */

import { ROUTES, MESES } from './utils/constants.js';

let currentRoute = null;
let routeCallback = null;

/**
 * Parsea el hash de la URL.
 * Formatos soportados:
 *   #/dashboard
 *   #/mes/enero
 *   #/config
 * @returns {{ view: string, param: string|null }}
 */
function parseHash() {
  const hash = window.location.hash.replace('#/', '') || ROUTES.QUICK_ADD;
  const parts = hash.split('/');
  
  return {
    view: parts[0] || ROUTES.QUICK_ADD,
    param: parts[1] || null,
  };
}

/**
 * Navega a una ruta.
 * @param {string} view - 'dashboard', 'mes', 'config'
 * @param {string} [param] - Parámetro (ej: 'enero')
 */
export function navigate(view, param) {
  const path = param ? `#/${view}/${param}` : `#/${view}`;
  window.location.hash = path;
}

/**
 * Obtiene la ruta actual parseada.
 * @returns {{ view: string, param: string|null }}
 */
export function getCurrentRoute() {
  return parseHash();
}

/**
 * Inicializa el router y empieza a escuchar cambios de hash.
 * @param {Function} callback - Función que recibe { view, param } cuando cambia la ruta.
 */
export function initRouter(callback) {
  routeCallback = callback;
  
  window.addEventListener('hashchange', () => {
    const route = parseHash();
    if (routeCallback) routeCallback(route);
  });
  
  // Trigger inicial
  if (!window.location.hash) {
    // Default: quick-add
    navigate(ROUTES.QUICK_ADD);
  } else {
    const route = parseHash();
    if (routeCallback) routeCallback(route);
  }
}

/**
 * Navega al mes actual (basado en la fecha del sistema).
 */
export function navigateToCurrentMonth() {
  const mesIndex = new Date().getMonth();
  navigate(ROUTES.MONTHLY, MESES[mesIndex]);
}
