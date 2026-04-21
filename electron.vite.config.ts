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
        // Externalize native modules and CJS-only packages so they're not bundled
        external: ['better-sqlite3', 'koffi', 'libwin32', 'tesseract.js', 'tesseract.js-core'],
        output: {
          // Keep external modules as require() calls
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
        formats: ['cjs'], // Use CommonJS for sandboxed preload
      },
    },
  },
  renderer: {
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
