import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Base path para GitHub Pages (repo "mis-cuentas" → shiforobles.github.io/mis-cuentas/).
// En dev (mode 'development') Vite sirve desde '/'; el subpath solo aplica al build.
export default defineConfig(({ mode }) => {
const BASE = mode === 'production' ? '/mis-cuentas/' : '/';

return {
  base: BASE,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Mis Cuentas — Finanzas Personales',
        short_name: 'Mis Cuentas',
        description: 'App de finanzas personales. Controlá tus ingresos, egresos e inversiones.',
        theme_color: '#0a0f1c',
        background_color: '#0a0f1c',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'es-AR',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: `${BASE}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${BASE}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: '+ Gasto', short_name: 'Gasto', url: `${BASE}#/quick-add?tipo=gasto`, icons: [{ src: `${BASE}icons/icon-192.png`, sizes: '192x192' }] },
          { name: '+ Ingreso', short_name: 'Ingreso', url: `${BASE}#/quick-add?tipo=ingreso`, icons: [{ src: `${BASE}icons/icon-192.png`, sizes: '192x192' }] }
        ],
        categories: ['finance', 'productivity']
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    port: 5174,
    host: true
  }
};
});
