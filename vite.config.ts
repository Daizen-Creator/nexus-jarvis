import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Caminhos relativos são obrigatórios no Electron: a janela carrega o bundle
  // por `file://`, e um `/assets/...` absoluto aponta para a raiz do disco.
  // Funciona igual em servidor web, então serve para os dois alvos.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
