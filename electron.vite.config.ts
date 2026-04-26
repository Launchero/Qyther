import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/main.ts'),
        formats: ['es'],
      },
      rollupOptions: {
        external: ['better-sqlite3', 'koffi', 'libwin32', 'tesseract.js', 'tesseract.js-core'],
        output: {
          format: 'es',
        },
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'src/preload/preload.ts'),
        formats: ['cjs'],
      },
    },
  },
  renderer: {
    publicDir: resolve(__dirname, 'public'),
    plugins: [
      react({
        // React 19 Compiler enabled by default
      }),
    ],
    build: {
      outDir: 'out/renderer',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
  },
});
