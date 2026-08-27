import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Cashback Optimizer',
        short_name: 'Cashback',
        description: 'Оптимизатор распределения платежей по банковским картам для максимизации кэшбека',
        theme_color: '#1a1917',
        background_color: '#121211',
        display: 'standalone',
        lang: 'ru',
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
