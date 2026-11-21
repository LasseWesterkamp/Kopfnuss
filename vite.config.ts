import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE: Unterpfad auf GitHub Pages (https://<user>.github.io/kopfnuss/). Lokal "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'flags/*.svg', 'img/*.webp', 'data/*.json'],
      manifest: {
        name: 'Kopfnuss – Allgemeinwissen',
        short_name: 'Kopfnuss',
        description: 'Jeden Tag 10 Fragen: Geografie, Geschichte, Politik, Natur und mehr.',
        lang: 'de',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#f7f3ec',
        theme_color: '#b4531c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,json}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: base + 'index.html',
        importScripts: ['push-sw.js'], // Push-Benachrichtigungen (public/push-sw.js)
      },
    }),
  ],
  define: { __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME ?? new Date().toISOString()) },
  test: { include: ['src/**/*.test.ts'] },
} as any);
