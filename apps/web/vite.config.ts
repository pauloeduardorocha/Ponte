import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), '..', '..'), '');

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['logo.png', 'favicon.ico', 'icons/*.png'],
        manifest: {
          id: '/',
          name: 'Ponte — Gestão da Igreja',
          short_name: 'Ponte',
          description: 'A vida da igreja no seu telemóvel.',
          lang: 'pt',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#d91017',
          background_color: '#f7f8fa',
          icons: [
            { src: '/icons/logo-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/logo-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/logo-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          importScripts: ['/push-worker.js'],
          globPatterns: ['**/*.{js,css,html,png,jpg,svg,ico,woff2}'],
          navigateFallbackDenylist: [/^\/api(?:\/|$)/],
          // Only the public application shell is cached, never authenticated API data.
          runtimeCaching: [],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      strictPort: true,
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    build: {
      manifest: true,
      commonjsOptions: {
        // Workspace packages resolve outside node_modules after symlink resolution.
        include: [/node_modules/, /packages[\\/]shared[\\/]/],
      },
      // Let Rollup share modules by usage so lazy-only UI stays with its routes.
    },
    test: {
      maxWorkers: 2,
      testTimeout: 15000,
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
