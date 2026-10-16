import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readdir, readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Post-build patch: replace Vite/rolldown-injected `import.meta.dirname`
// (Node.js 23+ feature) with safe fallback (Electron 42 uses Node 22)
// Also copies sql-wasm.wasm to output dir for runtime loading
const __dirnameFixPlugin = () => ({
  name: 'dirname-fix-and-wasm',
  async writeBundle(this: any) {
    const outDir = 'out/main';
    const files = await readdir(outDir);
    const jsFiles = files.filter(f => f.endsWith('.js'));
    for (const file of jsFiles) {
      const filePath = resolve(outDir, file);
      let content = await readFile(filePath, 'utf-8');
      // Use safe fallback: `import.meta.dirname` is undefined in Node <23
      // Use __filename-based approach for accuracy (bindings relies on __dirname)
      const patched = content.replace(
        /const __dirname = import\.meta\.dirname;/g,
        'const __dirname = typeof import.meta.dirname !== "undefined" ? import.meta.dirname : (typeof __filename !== "undefined" ? require("path").dirname(__filename) : ".");'
      );
      if (patched !== content) {
        await writeFile(filePath, patched);
      }
    }

    // Copy sql-wasm.wasm to output dir so runtime can load it. A missing wasm is a hard
    // build failure: silently shipping without it turns every database write into a no-op.
    const wasmSrc = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
    const wasmDst = resolve(outDir, 'sql-wasm.wasm');
    if (!existsSync(wasmSrc)) {
      throw new Error(
        `sql-wasm.wasm not found at ${wasmSrc}. Install dependencies (sql.js ships it) — ` +
        `the build must not ship without it or agent memory silently stops persisting.`
      );
    }
    await copyFile(wasmSrc, wasmDst);

    // Copy native Automation.node from node-winautomation to output dir. The addon only
    // exists on machines that ran node-gyp with a C++ toolchain, so its absence is a loud
    // warning naming the consequence rather than a swallowed catch.
    const nodeSrc = resolve('node_modules/node-winautomation/build/Release/Automation.node');
    const nodeDst = resolve(outDir, 'Automation.node');
    if (existsSync(nodeSrc)) {
      await copyFile(nodeSrc, nodeDst);
    } else {
      console.warn(
        `[build] ${nodeSrc} is not built: the UIA desktop tools (get_element_info, ` +
        `click_element, search_elements, invoke_element, set_element_value, get_element_text) ` +
        `will be unavailable. Build it with node-gyp in node_modules/node-winautomation.`
      );
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
        // Native/host modules stay external so they resolve from node_modules at runtime.
        // @aws-sdk/client-s3 is externalised rather than installed: it is only reached by
        // unzipper's optional S3 opener (unzipper/lib/Open/index.js:98), which this app
        // never calls, and rolldown fails the build if it tries to bundle an absent module.
        external: ['electron', 'koffi', 'libwin32', 'tesseract.js', 'tesseract.js-core', 'node-winautomation', '@aws-sdk/client-s3'],
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
      // Multi-page: the palette loads index.html, the settings window loads settings.html. electron-vite
      // does not auto-glob a second renderer HTML, so both entries are listed here — the MPA gate in
      // AGENTS.md (`npm run build` must emit out/renderer/settings.html, not just index.html).
      rollupOptions: {
        input: [
          resolve(__dirname, 'src/renderer/index.html'),
          resolve(__dirname, 'src/renderer/settings.html'),
        ],
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
      },
    },
  },
});
