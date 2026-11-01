import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false
  },
  build: {
    target: 'esnext',
    assetsInlineLimit: 0
  }
});

