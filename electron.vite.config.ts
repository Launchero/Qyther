import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readdir, readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Post-build patch: replace Vite/rolldown-injected `import.meta.dirname`
// (Node.js 23+ feature) with safe fallback (Electron 42 uses Node 22)
const __dirnameFixPlugin = () => ({
  name: 'dirname-fix',
  async writeBundle(this: any) {
    const outDir = 'out/main';
    const files = await readdir(outDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    for (const file of jsFiles) {
      const filePath = resolve(outDir, file);
      let content = await readFile(filePath, 'utf-8');
      // Use safe fallback: `import.meta.dirname` is undefined in Node <23
      const patched = content.replace(
        /const __dirname = import\.meta\.dirname;/g,
        'const __dirname = typeof import.meta.dirname !== "undefined" ? import.meta.dirname : ".";'
      );
      if (patched !== content) {
        await writeFile(filePath, patched);
      }
    }
  },
});

export default defineConfig({
  main: {
    plugins: [__dirnameFixPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/main.ts'),
        formats: ['es'],
      },
      rollupOptions: {
        external: ['electron', 'better-sqlite3', 'koffi', 'libwin32', 'tesseract.js', 'tesseract.js-core'],
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
