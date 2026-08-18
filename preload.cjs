// deepseek-zion — PROTOTYPE preload (CommonJS — sandboxed renderers require CJS)
// Minimal, secure bridge: exposes read-only env facts. The harness UI runs with
// full context-isolation / sandbox; this preload adds nothing to the page API.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld(
  'zion',
  {
    platform: process.platform,
    version: '0.1.0-proto',
    port: Number(process.env.ZION_PORT ?? 3080),
  },
)
