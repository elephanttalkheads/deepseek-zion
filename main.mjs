// ============================================================
// deepseek-zion — PROTOTYPE
// Electron desktop shell that loads the REAL DeepSeek Harness
// web UI (dsh web) with feature parity.
//
// Architecture (v0.1-proto):
//   1. Probe a local dsh web server on 127.0.0.1:PORT (default 3080).
//   2. If not already running, spawn `dsh --profile web --port PORT`
//      from this machine's dsh CLI and wait until it answers.
//   3. Open a frameless-but-standard BrowserWindow that loads the
//      server URL directly. The official dist is served by dsh, so
//      UI is pixel-identical and all features (sessions, chat, tools,
//      settings, trajectory...) work exactly like the browser dsh web.
//
// No Vite/renderer build yet — the "UI" IS the official harness UI.
// A future iteration will inject the ZION visual layer on top.
// ============================================================

import { BrowserWindow, app, shell } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// --- config ---------------------------------------------------
const DEFAULT_PORT = 3080
const PROBE_TIMEOUT = 1200 // ms per single port probe
const SPAWN_WAIT_LIMIT = 60_000 // give dsh up to 60s to boot
const SPAWN_PROBE_INTERVAL = 800

// --- replica mode (electron shell for OUR renderer) -----------
// `electron . --replica` 加载复刻界面(renderer/dist 经 vite preview 服务):
//   1. ensure 3080 真后端(dsh web,复用上面的 spawn 逻辑);
//   2. renderer/dist 缺失时先 `vite build`(源码改动需手动 build:web,与 5199 线一致);
//   3. 起 `vite preview --port 5199`(提供 /api + ws 代理到 3080);
//   4. BrowserWindow 加载 http://127.0.0.1:5199 —— 窗口里就是复刻 UI。
const REPLICA_MODE = process.argv.includes('--replica')
const REPLICA_PORT = 5199
const REPLICA_DIST = path.join(__dirname, 'renderer', 'dist', 'index.html')
const VITE_JS = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js')
const REPLICA_CONFIG = path.join(__dirname, 'renderer', 'vite.config.ts')
const BUILD_WAIT_LIMIT = 180_000 // give vite build up to 3min

function argPort() {
  const i = process.argv.indexOf('--port')
  const p = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isInteger(p) && p > 0 ? p : DEFAULT_PORT
}
const PORT = argPort()

// --- net helpers ----------------------------------------------
/** True when a TCP server answers on 127.0.0.1:port within timeout. */
function probe(port, timeout = PROBE_TIMEOUT) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port, timeout })
    const done = (ok) => { sock.destroy(); resolve(ok) }
    sock.once('connect', () => done(true))
    sock.once('timeout', () => done(false))
    sock.once('error', () => done(false))
  })
}

async function waitForServer(port, limitMs) {
  const start = Date.now()
  while (Date.now() - start < limitMs) {
    if (await probe(port)) return true
    await new Promise((r) => setTimeout(r, SPAWN_PROBE_INTERVAL))
  }
  return false
}

/** Windows: resolve `dsh` to a spawnable executable (npm .cmd or powershell psh). */
function resolveDshCmdline(args) {
  if (process.platform === 'win32') {
    // dsh is installed as a .ps1 on this machine; prefer running it via
    // PowerShell detached & hidden so no console window haunts the app.
    const quoted = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(' ')
    return {
      file: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
        '-Command', `dsh ${quoted}`],
      opts: { windowsHide: true, cwd: process.env.USERPROFILE },
    }
  }
  return { file: 'dsh', args, opts: { cwd: process.env.HOME } }
}

// --- child-process lifecycle -----------------------------------
let spawnedChild = null
let weSpawned = false

async function ensureServer(port) {
  if (await probe(port)) {
    console.log(`[zion] dsh web already running on 127.0.0.1:${port} — using it.`)
    return
  }
  console.log(`[zion] spawning dsh web on port ${port} ...`)
  const { file, args, opts } = resolveDshCmdline([
    '--profile', 'web', '--port', String(port),
  ])
  spawnedChild = spawn(file, args, { ...opts, stdio: 'ignore' })
  weSpawned = true
  const ok = await waitForServer(port, SPAWN_WAIT_LIMIT)
  if (!ok) {
    throw new Error(
      `[zion] dsh web did not become reachable on 127.0.0.1:${port} within ` +
      `${SPAWN_WAIT_LIMIT}ms. Start it yourself with:  dsh --profile web --port ${port}`,
    )
  }
  console.log(`[zion] dsh web is up on 127.0.0.1:${port}.`)
}

// --- replica-mode child-process lifecycle ---------------------
let replicaChild = null // vite build / preview we spawned (kill on exit)
let weSpawnedReplica = false

/** Run a node CLI script (vite) via the PATH node — works in dev like the npm scripts. */
function spawnNode(args, opts = {}) {
  const nodeBin = process.env.npm_node_execpath || 'node'
  return spawn(nodeBin, args, { cwd: __dirname, windowsHide: true, stdio: 'inherit', ...opts })
}

/** True once `file` exists on disk (polled). */
function waitForFile(file, limitMs) {
  const start = Date.now()
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (fs.existsSync(file)) { clearInterval(timer); resolve(true) }
      else if (Date.now() - start > limitMs) { clearInterval(timer); resolve(false) }
    }, 400)
  })
}

/**
 * Bring up the replica UI: backend on 3080 (reused / spawned), a fresh
 * renderer build when dist is missing, then `vite preview` on 5199 which
 * proxies /api (+ws) to the backend. Returns the URL the window loads.
 */
async function startReplica() {
  await ensureServer(DEFAULT_PORT)

  if (!fs.existsSync(REPLICA_DIST)) {
    console.log('[zion] renderer/dist missing — running vite build ...')
    replicaChild = spawnNode([VITE_JS, 'build', '--config', REPLICA_CONFIG])
    weSpawnedReplica = true
    const built = await waitForFile(REPLICA_DIST, BUILD_WAIT_LIMIT)
    if (!built) {
      throw new Error(
        '[zion] vite build did not produce renderer/dist/index.html within ' +
        `${BUILD_WAIT_LIMIT}ms — fix the build errors above, then rerun.`,
      )
    }
    console.log('[zion] renderer build finished.')
  }

  console.log(`[zion] starting vite preview on 127.0.0.1:${REPLICA_PORT} ...`)
  replicaChild = spawnNode([
    VITE_JS, 'preview', '--config', REPLICA_CONFIG,
    '--host', '127.0.0.1', // force IPv4: our probe + loadURL both use 127.0.0.1
    '--port', String(REPLICA_PORT), '--strictPort',
  ])
  weSpawnedReplica = true
  const up = await waitForServer(REPLICA_PORT, SPAWN_WAIT_LIMIT)
  if (!up) {
    throw new Error(
      `[zion] vite preview did not become reachable on 127.0.0.1:${REPLICA_PORT} ` +
      'within 60s — is the port already taken by another service?',
    )
  }
  console.log(`[zion] replica UI is up on 127.0.0.1:${REPLICA_PORT}.`)
  return `http://127.0.0.1:${REPLICA_PORT}`
}

// --- window ----------------------------------------------------
function createWindow(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0f0b',
    title: 'DeepSeek Zion',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  // External links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url: u }) => {
    if (u.startsWith('http:') || u.startsWith('https:')) shell.openExternal(u)
    return { action: 'deny' }
  })

  // Also swallow navigations away from the harness origin.
  win.webContents.on('will-navigate', (e, u) => {
    if (!u.startsWith(url)) { e.preventDefault(); shell.openExternal(u) }
  })

  win.loadURL(url)
  win.webContents.once('did-finish-load', () => {
    console.log(`[zion] window loaded: ${url}`)
  })
  return win
}

// --- lifecycle ------------------------------------------------
app.whenReady().then(async () => {
  let url
  try {
    if (REPLICA_MODE) {
      url = await startReplica()
    } else {
      await ensureServer(PORT)
      url = `http://127.0.0.1:${PORT}`
    }
    createWindow(url)
  } catch (err) {
    console.error(err?.message ?? err)
    // Report before giving up: still open a window targeted at the URL so the
    // user can at least see the intended surface, then surface the error.
    url = url ?? `http://127.0.0.1:${REPLICA_MODE ? REPLICA_PORT : PORT}`
    const win = createWindow(url)
    win.webContents.on('did-fail-load', () => {
      win.webContents.executeJavaScript(
        `document.documentElement.innerHTML = '<body style="background:#0b0f0b;color:#c8ffd4;font:14px monospace;padding:40px"><h2>DeepSeek Zion — not reachable</h2><pre style="color:#ff6b6b">${String(err?.message ?? err).replace(/</g, '&lt;')}</pre><p>Start the harness yourself:</p><code>dsh --profile web --port ${PORT}</code></body>'`,
      ).catch(() => {})
    })
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url)
  })
})

app.on('window-all-closed', () => {
  // Only kill the harness if WE started it; never kill the user's own server.
  if (process.platform !== 'darwin') {
    if (weSpawned && spawnedChild) {
      console.log('[zion] shutting down spawned dsh web ...')
      try { spawnedChild.kill() } catch { /* ignore */ }
    }
    if (weSpawnedReplica && replicaChild) {
      console.log('[zion] shutting down spawned vite preview/build ...')
      try { replicaChild.kill() } catch { /* ignore */ }
    }
    app.quit()
  }
})

// Forward --version etc through to the terminal for debugging.
process.on('uncaughtException', (err) => console.error('[zion] uncaught', err))
