import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

export default defineConfig({
  server: {
    host: true,  // expose to LAN (0.0.0.0)
    https: {},   // enable self-signed TLS → crypto.subtle works on 192.168.x.x
  },
  plugins: [
    basicSsl(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'screenshots/*.png', 'icon.svg', 'logo.svg'],
      manifest: {
        name: 'Shillak',
        short_name: 'Shillak',
        description: 'Private group budget tracker — offline, no cloud',
        theme_color: '#0f0f0f',
        background_color: '#0f0f0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        screenshots: [
          {
            src: 'screenshots/mobile.png',
            sizes: '1000x1264',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Shillak — Dashboard',
          },
          {
            src: 'screenshots/wide.png',
            sizes: '2560x1264',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Shillak — Dashboard (desktop)',
          },
        ],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf,otf}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
