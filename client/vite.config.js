import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:8001', ws: true },
      '/api': { target: 'http://localhost:8001' },
    },
  },
});
