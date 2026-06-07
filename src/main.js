/**
 * MIS CUENTAS — Entry Point
 * Inicializa la app: DB, tema, router, header, nav, y carga la primera vista.
 */

// Styles
import './styles/index.css';
import './styles/components.css';
import './styles/monthly.css';
import './styles/dashboard.css';
import './styles/settings.css';
import './styles/quick-add.css';
import './styles/search.css';
import './styles/compare.css';

// Modules
import { seedDatabase } from './db/seed.js';
import { migrateToV3 } from './db/database.js';
import { initRouter, getCurrentRoute } from './router.js';
import { renderHeader, applyTheme } from './components/header.js';
import { renderNav, updateNavActive } from './components/navigation.js';
import { renderDashboard } from './views/dashboard.js';
import { renderMonthlyView } from './views/monthly.js';
import { renderSettings } from './views/settings.js';
import { renderQuickAdd } from './views/quick-add.js';
import { fetchDolar } from './services/dollar.js';
import { ROUTES, MESES } from './utils/constants.js';

/**
 * Inicialización de la app.
 */
async function init() {
  try {
    // 1. Aplicar tema guardado
    await applyTheme();
    
    // 2. Migrar datos a v3 (IDs con año) — idempotente
    await migrateToV3();
    
    // 3. Inicializar base de datos con datos por defecto
    await seedDatabase();
    
    // 4. Renderizar shell (header + nav)
    renderHeader();
    renderNav();
    
    // 5. Iniciar router
    initRouter(handleRoute);
    
    // 6. Traer dólar de la API (en background, no bloqueante)
    fetchDolar().then(() => {
      console.log('✓ Dólar actualizado desde API');
    }).catch(e => {
      console.warn('No se pudo actualizar el dólar:', e.message);
    });

    // 7. Inicializar sincronización (auto-sync + indicador). No bloqueante y
    //    seguro si Supabase no está configurado.
    import('./services/sync.js').then(({ initSync }) => initSync())
      .catch(e => console.warn('Sync no inicializado:', e.message));

    console.log('✓ Mis Cuentas inicializada');
  } catch (error) {
    console.error('Error inicializando la app:', error);
    const main = document.getElementById('app-main');
    main.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">⚠️</div>
        <div class="empty-state__text">
          Error al inicializar la app. Intentá recargar la página.<br>
          <small style="color:var(--color-text-muted)">${error.message}</small>
        </div>
      </div>
    `;
  }
}

/**
 * Maneja los cambios de ruta.
 * @param {{ view: string, param: string|null }} route
 */
async function handleRoute(route) {
  updateNavActive(route);
  
  switch (route.view) {
    case ROUTES.QUICK_ADD:
      await renderQuickAdd();
      break;

    case ROUTES.DASHBOARD:
      await renderDashboard(route.param);
      break;
      
    case ROUTES.MONTHLY: {
      // Si no hay parámetro de mes, ir al mes actual
      let mes = route.param;
      if (!mes || !MESES.includes(mes)) {
        mes = MESES[new Date().getMonth()];
      }
      await renderMonthlyView(mes);
      break;
    }
    
    case ROUTES.SETTINGS:
      await renderSettings();
      break;

    case ROUTES.SEARCH: {
      const { renderSearch } = await import('./views/search.js');
      await renderSearch();
      break;
    }

    case ROUTES.COMPARE: {
      const { renderCompare } = await import('./views/compare.js');
      await renderCompare(route.param);
      break;
    }
      
    default:
      await renderQuickAdd();
      break;
  }
}

// Arrancar la app
init();
