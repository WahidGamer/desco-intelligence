import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: 'client',
    build: {
      outDir: '../dist',
      emptyOutDir: true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './client'),
      },
    },
    server: {
      hmr: true,
    },
  };
});
