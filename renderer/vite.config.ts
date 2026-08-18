import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

// Replica renderer build. root = this renderer/ dir.
// Dev: bare Vite + `?fixture` (no backend needed). Prod: built into
// renderer/dist and loaded by the Electron shell.
//
// The official client data-layer packages (dsh-client-*) are distributed as
// ClientModuleSystem bundles (window.__ModuleLoader__.load(...)) that cannot
// be imported directly. Q16B ("pure-class direct assembly") therefore vendors
// their SOURCE into renderer/vendor and compiles it here; their workspace
// package names are aliased to the vendored src. All other @deepseek-ai/*
// deps (apiproxy / llm / session / ...) are plain ESM and resolve from
// node_modules (file: refs to the local rc.6 install).
export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      // Exact (= anchored) regex aliases so `.../client` subpaths are not
      // swallowed by their broader parent alias (string prefix matching).
      { find: /^@deepseek-ai\/dsh-client-connection\/client$/, replacement: here + 'vendor/client-connection/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-connection$/, replacement: here + 'vendor/client-connection/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-runtime\/client$/, replacement: here + 'vendor/client-runtime/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-runtime$/, replacement: here + 'vendor/client-runtime/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-web-react$/, replacement: here + 'vendor/client-web-react/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-slots$/, replacement: here + 'vendor/client-ui-slots/index.ts' },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
