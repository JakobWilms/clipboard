import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import packageJson from './package.json';

export default defineConfig({
  // Relative asset URLs so the app also works behind a path prefix (e.g. /clipboard/).
  base: './',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
});
