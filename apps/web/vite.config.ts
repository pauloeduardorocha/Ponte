import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(process.cwd(), '..', '..'), '');

  return {
    plugins: [react()],
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return;
            }
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'ui';
            }
            if (
              id.includes('react-dom') ||
              id.includes('react-router') ||
              id.includes('/react/')
            ) {
              return 'react';
            }
            if (id.includes('@tanstack')) {
              return 'query';
            }
          },
        },
      },
    },
    test: {
      maxWorkers: 2,
      testTimeout: 15000,
      environment: 'jsdom',
      setupFiles: ['./src/test-setup.ts'],
    },
  };
});
