import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@deepseek-ai\/dsh-client-connection\/client$/, replacement: here + 'vendor/client-connection/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-connection$/, replacement: here + 'vendor/client-connection/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-runtime\/client$/, replacement: here + 'vendor/client-runtime/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-runtime$/, replacement: here + 'vendor/client-runtime/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-web-react$/, replacement: here + 'vendor/client-web-react/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-slots$/, replacement: here + 'vendor/client-ui-slots/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: here + 'vendor/ui-primitives/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-trajectory\/client$/, replacement: here + 'vendor/ui-trajectory/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-trajectory$/, replacement: here + 'vendor/ui-trajectory/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-model-selection\/client$/, replacement: here + 'vendor/ui-model-selection/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-model-selection$/, replacement: here + 'vendor/ui-model-selection/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-plan\/client$/, replacement: here + 'vendor/ui-plan/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-plan$/, replacement: here + 'vendor/ui-plan/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-permission-presets\/client$/, replacement: here + 'vendor/ui-permission-presets/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-permission-presets$/, replacement: here + 'vendor/ui-permission-presets/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-attachment$/, replacement: here + 'vendor/ui-attachment/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-ui-input-trigger\/client$/, replacement: here + 'vendor/ui-input-trigger/client/index.ts' },
      { find: /^@deepseek-ai\/dsh-client-schema-form$/, replacement: here + 'vendor/schema-form/index.ts' },
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
