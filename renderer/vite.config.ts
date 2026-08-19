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
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: here + 'vendor/ui-primitives/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-trajectory\/client$/, replacement: here + 'vendor/ui-trajectory/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-trajectory$/, replacement: here + 'vendor/ui-trajectory/index.ts' },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: proxy3080(),
  },
  preview: {
    port: 5199,
    strictPort: true,
    proxy: proxy3080(),
  },
})

/** Same-origin bridge to the real dsh backend (3080) for parity acceptance:
 *  the replica page stays on its own origin while /api (unary + mux/host WS)
 *  and the SSE/download lanes are forwarded to the running dsh web server.
 *  The forwarding proxy strips Origin, so the backend trust fence
 *  (api-request-trust: Host loopback + absent Origin) admits the relayed
 *  request exactly like a browser on the backend origin would. */
function proxy3080(): Record<string, object> {
  const stripOrigin = (proxyReq: { removeHeader: (name: string) => void }): void => {
    proxyReq.removeHeader('origin')
  }
  return {
    '/api': {
      target: 'http://127.0.0.1:3080',
      changeOrigin: true,
      ws: true,
      configure: (proxy: { on: (event: string, cb: (req: unknown, socket: unknown, head?: unknown) => void) => void }) => {
        proxy.on('proxyReq', (proxyReq: { removeHeader: (name: string) => void }) => { stripOrigin(proxyReq) })
        proxy.on('proxyReqWs', (proxyReq: { removeHeader: (name: string) => void }) => { stripOrigin(proxyReq) })
      },
    },
  }
}
