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

import { BrowserWindow, app, nativeImage, shell } from 'electron'
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
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

// --- inspector mode (组件召唤器,官方原版 UI 应用内) ----------------
// `electron . --inspector`:加载官方 3080 UI 后注入组件召唤面板(悬浮按钮+舞台),
// 并在 127.0.0.1:5198 起本地控制口(CLI: node inspector/cli.mjs …)。
// `--fixture`:页面 URL 带 ?fixture(官方 in-process 假后端,真实配方零副作用)。
// `--hidden`:窗口不显示(适合 AI 无头验收;截图仍可用 capturePage)。
const INSPECTOR_MODE = process.argv.includes('--inspector')
const FIXTURE_MODE = process.argv.includes('--fixture')
const HIDDEN_MODE = process.argv.includes('--hidden')
const inspectorPortOverride = Number(process.env.ZION_INSPECTOR_PROBE_CONTROL_PORT)
const INSPECTOR_PORT_OVERRIDDEN = Number.isInteger(inspectorPortOverride) && inspectorPortOverride > 0 && inspectorPortOverride <= 65535
const INSPECTOR_PORT = INSPECTOR_PORT_OVERRIDDEN
  ? inspectorPortOverride
  : 5198
const INSPECTOR_DEFAULT_PORT = !INSPECTOR_PORT_OVERRIDDEN
const INSPECTOR_FALLBACK_PORTS = [5208, 5218, 5228]
const INSPECTOR_SHOT_DIR = path.join(__dirname, 'inspector', 'shot-out')
const INSPECTOR_PORT_FILE = path.join(__dirname, 'inspector', '.port')

// P2-8:多实例共用 user-data 时 Chromium 缓存目录互相搬家会刷「拒绝访问」噪音。
// inspector 是 dev 工具,给独立缓存目录(按模式区分,稳定复用)。
if (INSPECTOR_MODE) {
  app.setPath('cache', path.join(app.getPath('userData'), `cache-inspector-${FIXTURE_MODE ? 'fixture' : 'real'}-${process.pid}`))
}

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
    // --hidden:窗口移到屏外而非隐藏 —— capturePage 对「显示中」窗口最稳,
    // 屏外位置保证截图可用又不打扰桌面。
    ...(HIDDEN_MODE ? { x: -32000, y: -32000 } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // The inspector preload uses this renderer-only marker to capture the
      // real ClientModuleSystem before the official page's first script boots.
      ...(INSPECTOR_MODE ? { additionalArguments: ['--zion-inspector-capture-modules'] } : {}),
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
  win.webContents.on('did-finish-load', () => {
    console.log(`[zion] window loaded: ${url}`)
    if (INSPECTOR_MODE) void installInspector(win)
  })
  return win
}

// --- inspector (组件召唤器) --------------------------------------
// 注入:manifest(JSON) + page-panel.js + recipes.js → 页面 boot 完成后执行。
// 控制口:127.0.0.1:5198(仅 --inspector;回环绑定,dev 工具)。
let inspectorServer = null
let inspectorServerStart = null
let inspectorQueue = Promise.resolve() // 页面操作串行化(挂载/截图不打架)

const INSPECTOR_MANIFEST_FILE = path.join(__dirname, 'inspector', 'manifest.json')
const INSPECTOR_PANEL_JS = path.join(__dirname, 'inspector', 'page-panel.js')
const INSPECTOR_RECIPES_JS = path.join(__dirname, 'inspector', 'recipes.js')

/** True when preload captured the new module system (or an older DSH exposed the legacy global). */
async function hasInspectorModules(wc) {
  try {
    return await wc.executeJavaScript(
      `typeof (window.__ZION_INSPECTOR_MODULES__ || window.__DSH_MODULES__)?.import === 'function'`,
    )
  } catch {
    return false
  }
}

/** 组装并注入面板 bundle(manifest + panel + recipes)。返回是否成功。 */
async function injectInspectorBundle(wc) {
  let bundle = 'window.__ZION_INSPECTOR_MANIFEST__ = ' + fs.readFileSync(INSPECTOR_MANIFEST_FILE, 'utf8') + ';\n'
  bundle += fs.readFileSync(INSPECTOR_PANEL_JS, 'utf8') + '\n'
  bundle += fs.readFileSync(INSPECTOR_RECIPES_JS, 'utf8') + '\n'
  bundle += 'void 0;\n' // 完成值必须是可克隆的(undefined);否则 IPC 报 "could not be cloned"
  try {
    await wc.executeJavaScript(bundle)
    return true
  } catch (err) {
    console.error('[zion-inspector] 注入失败:', err?.message ?? err)
    return false
  }
}

async function installInspector(win) {
  const wc = win.webContents
  // 屏外/隐藏窗口会被节流(rAF/定时器暂停)→ 挂载/等待永不完成;关掉节流。
  wc.setBackgroundThrottling(false)
  // Panel/real recipes must not be gated by overlay import capability: fixture
  // welcome cleanup still needs to run when a future DSH boot seam drifts.
  const injected = await injectInspectorBundle(wc)
  if (!injected) return
  const modulesReady = await hasInspectorModules(wc)
  if (!modulesReady) {
    console.warn('[zion-inspector] 未捕获带 import() 的 ClientModuleSystem；面板与真实配方可用，舞台召唤将给出明确错误')
  }
  console.log(`[zion-inspector] 召唤面板已注入(模块导入:${modulesReady ? '就绪' : '不可用'};悬浮按钮:右下角「⿻ 组件」;控制口见下方日志)`)
  await startInspectorServer(win)
}

/**
 * P0-1:若 5198 已被「上一个 inspector 实例」占用(常见于 npm 包装进程被杀、
 * 留下孤儿 electron),直接按端口找 PID 杀掉旧进程树,避免带病启动
 * (面板注入成功但控制口 EADDRINUSE、cli 打到旧实例)。
 */
async function takeoverOldInspector() {
  // Regression probes use an ephemeral control port and must never disturb a
  // developer's live inspector on 5198.
  if (!INSPECTOR_DEFAULT_PORT || process.platform !== 'win32') return false
  try {
    const res = await fetch('http://127.0.0.1:5198/api/inspector/status', { signal: AbortSignal.timeout(1500) })
    const j = await res.json().catch(() => null)
    if (!j || j.app !== 'deepseek-zion inspector') return false
    const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
    const line = out.split(/\r?\n/).find((l) => l.includes('127.0.0.1:5198') && l.includes('LISTENING'))
    if (!line) return false
    const pid = line.trim().split(/\s+/).pop()
    execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
    console.log(`[zion-inspector] 检测到旧 inspector 实例(PID ${pid})占用 5198 —— 已接管并清场`)
    await new Promise((r) => setTimeout(r, 1200))
    return true
  } catch { /* 无旧实例或已释放 */ }
  return false
}

/** 页内执行一段 JS,把返回值(必须是 JSON 安全值)取回主进程。 */
async function pageCall(wc, expr) {
  const result = await wc.executeJavaScript(`(async () => {
    try { return { __ok: true, value: await (${expr}) } }
    catch (e) { return { __ok: false, error: String(e && e.message || e) } }
  })()`)
  if (!result || result.__ok !== true) {
    const msg = (result && result.error) || 'page call failed'
    throw new Error(msg)
  }
  return result.value
}

/** PNG 亮度均值(0-255)。nativeImage 解码,无需第三方依赖。 */
function pngMeanBrightness(buffer) {
  try {
    const bitmap = nativeImage.createFromBuffer(buffer).toBitmap()
    if (!bitmap || bitmap.length === 0) return null
    const step = 4 // BGRA
    let sum = 0
    let n = 0
    for (let i = 0; i < bitmap.length; i += step) {
      sum += (bitmap[i] + bitmap[i + 1] + bitmap[i + 2]) / 3
      n += 1
    }
    return n > 0 ? Math.round(sum / n) : null
  } catch { return null }
}

/** 保存 capturePage 结果为 PNG;rect 存在则只截该区域(DIP)。返回 {file, mean, size}。 */
async function saveShot(win, rect, name) {
  fs.mkdirSync(INSPECTOR_SHOT_DIR, { recursive: true })
  const wc = win.webContents
  wc.invalidate() // 强制重绘,屏外窗口避免抓到旧帧
  await new Promise((r) => setTimeout(r, 120))
  const image = rect
    ? await wc.capturePage({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
    : await wc.capturePage()
  const size = image.getSize()
  const buffer = image.toPNG()
  const file = path.join(INSPECTOR_SHOT_DIR, `${name || 'shot'}.png`)
  fs.writeFileSync(file, buffer)
  return { file, mean: pngMeanBrightness(buffer), size: { width: size.width, height: size.height } }
}

async function startInspectorServer(win) {
  if (inspectorServer) return
  if (!inspectorServerStart) {
    inspectorServerStart = createInspectorServer(win).finally(() => { inspectorServerStart = null })
  }
  return inspectorServerStart
}

async function createInspectorServer(win) {
  fs.mkdirSync(INSPECTOR_SHOT_DIR, { recursive: true })
  // P0-1:5198 被旧 inspector 实例占用 → 接管清场;非 inspector 占用 → 退避端口。
  await takeoverOldInspector()
  const candidates = INSPECTOR_DEFAULT_PORT ? [INSPECTOR_PORT, ...INSPECTOR_FALLBACK_PORTS] : [INSPECTOR_PORT]
  let boundPort = null
  for (const port of candidates) {
    const ok = await new Promise((resolve) => {
      const srv = http.createServer()
      srv.once('error', () => resolve(false))
      srv.once('listening', () => { srv.close(() => resolve(true)) })
      srv.listen(port, '127.0.0.1')
    })
    if (ok) { boundPort = port; break }
  }
  if (boundPort === null) {
    console.error(`[zion-inspector] 控制口全部被占(${candidates.join('/')})—— 面板仍可用,CLI 控制不可用;请清场后重启`)
    return
  }
  if (INSPECTOR_DEFAULT_PORT && boundPort !== INSPECTOR_PORT) {
    console.log(`[zion-inspector] 5198 被非 inspector 占用,退避到 ${boundPort}`)
  }
  // 机器可读端口文件:cli 未设 ZION_INSPECTOR_URL 时读取。
  if (INSPECTOR_DEFAULT_PORT) fs.writeFileSync(INSPECTOR_PORT_FILE, String(boundPort))

  const send = (res, code, obj) => {
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end(JSON.stringify(obj))
  }
  inspectorServer = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {})
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = url.pathname
    const wc = win.webContents
    const readBody = () => new Promise((resolve) => {
      let data = ''
      req.on('data', (c) => { data += c })
      req.on('end', () => { try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) } })
    })
    const enqueue = (fn) => {
      const task = inspectorQueue.then(fn, fn) // 上一任务失败不阻塞后续
      inspectorQueue = task.catch(() => {})
      return task
    }
    if (route === '/api/inspector/status' || route === '/') {
      return send(res, 200, {
        ok: true,
        app: 'deepseek-zion inspector',
        controlPort: boundPort,
        url: wc.getURL(),
        fixture: wc.getURL().includes('fixture'),
        hidden: HIDDEN_MODE,
      })
    }
    if (route === '/api/inspector/reload') {
      // P0-2:显式重载配方/面板(销毁旧面板 DOM + 重新读盘注入),不依赖页面 reload。
      return enqueue(() => (async () => {
        const cleanup = [
          'window.__zionInspector = undefined',
          'window.__ZION_RECIPES__ = undefined',
          "['zion-inv-panel','zion-inv-launcher','zion-inv-style','zion-inv-stage'].forEach((id) => document.getElementById(id)?.remove())",
          'void 0',
        ].join('; ')
        await wc.executeJavaScript(cleanup)
        const injected = await injectInspectorBundle(wc)
        if (!injected) return send(res, 200, { ok: false, error: '重注入失败(见主进程日志)' })
        send(res, 200, { ok: true, note: '面板/配方已从磁盘重新注入' })
      })().catch((e) => send(res, 200, { ok: false, error: String(e.message || e) })))
    }
    if (route === '/api/inspector/list') {
      return enqueue(() => pageCall(wc, 'window.__zionInspector.list()')
        .then((entries) => send(res, 200, { ok: true, entries }))
        .catch((e) => send(res, 200, { ok: false, error: String(e.message || e) })))
    }
    if (route === '/api/inspector/summon') {
      return enqueue(() => readBody().then((b) =>
        pageCall(wc, `window.__zionInspector.summon(${JSON.stringify(b.id)}, ${JSON.stringify(b.opts || {})})`)
          .then((r) => send(res, 200, { ok: true, ...r }))
          .catch((e) => send(res, 200, { ok: false, error: String(e.message || e) }))))
    }
    if (route === '/api/inspector/raw') {
      return enqueue(() => readBody().then((b) =>
        pageCall(wc, `window.__zionInspector.summonRaw(${JSON.stringify(b.module)}, ${JSON.stringify(b.component)}, ${JSON.stringify(b.props ?? {})})`)
          .then((r) => send(res, 200, { ok: true, ...r }))
          .catch((e) => send(res, 200, { ok: false, error: String(e.message || e) }))))
    }
    if (route === '/api/inspector/recipe') {
      return enqueue(() => readBody().then((b) =>
        pageCall(wc, `window.__zionInspector.recipe(${JSON.stringify(b.id)})`)
          .then((r) => send(res, 200, { ok: true, ...r }))
          .catch((e) => send(res, 200, { ok: false, error: String(e.message || e) }))))
    }
    if (route === '/api/inspector/close') {
      return enqueue(() => pageCall(wc, 'window.__zionInspector.close()')
        .then(() => send(res, 200, { ok: true }))
        .catch((e) => send(res, 200, { ok: false, error: String(e.message || e) })))
    }
    if (route === '/api/inspector/eval') {
      // 原始 JS 执行(dev 探针;仅回环绑定)。表达式求值为 JSON 安全值。
      return enqueue(() => readBody().then((b) => {
        const code = String(b.code ?? '')
        return wc.executeJavaScript(`(async () => {
          try { return { __ok: true, value: await (${code}) } }
          catch (e) { return { __ok: false, error: String(e && e.message || e) } }
        })()`)
          .then((r) => send(res, 200, r && r.__ok === true ? { ok: true, value: r.value } : { ok: false, error: (r && r.error) || 'eval failed' }))
          .catch((e) => send(res, 200, { ok: false, error: String(e.message || e) }))
      }))
    }
    if (route === '/api/inspector/shot') {
      return enqueue(() => readBody().then(async (b) => {
        try {
          let rect = null
          if (b.rect) {
            rect = b.rect // 优先用召唤/配方算好的 rect(并集);selector 只作回退
          } else if (b.selector) {
            const r = await pageCall(wc, `window.__zionInspector.elementRect(${JSON.stringify(b.selector)})`)
            rect = r && r.rect ? r.rect : null
          }
          const name = String(b.name || 'shot').replace(/[^a-zA-Z0-9._-]/g, '') || 'shot'
          // 屏外窗口合成帧滞后:布局刚稳定就 capturePage 会抓到旧帧/黑帧,先等一拍。
          await new Promise((r) => setTimeout(r, 800))
          let shot = await saveShot(win, rect, name)
          // P0-3:均值亮度自检 —— 疑似空帧/黑帧自动重拍一次并标注。
          let retried = false
          if (shot.mean !== null && shot.mean < 10) {
            await new Promise((r) => setTimeout(r, 600))
            shot = await saveShot(win, rect, name)
            retried = true
          }
          send(res, 200, { ok: true, path: shot.file, rect, size: shot.size, mean: shot.mean, retried })
        } catch (e) {
          send(res, 200, { ok: false, error: String(e.message || e) })
        }
      }))
    }
    send(res, 404, { ok: false, error: `unknown route: ${route}` })
  })
  inspectorServer.on('error', (err) => {
    console.error(`[zion-inspector] 控制口 127.0.0.1:${boundPort} 启动失败:`, err.message)
    inspectorServer = null
  })
  inspectorServer.listen(boundPort, '127.0.0.1', () => {
    const hint = INSPECTOR_DEFAULT_PORT
      ? 'CLI: node inspector/cli.mjs status;端口文件 inspector/.port'
      : '回归探针隔离端口'
    console.log(`[zion-inspector] 控制口就绪: http://127.0.0.1:${boundPort} (${hint})`)
  })
}

// --- lifecycle ------------------------------------------------
app.whenReady().then(async () => {
  let url
  try {
    // P0-1:尽早接管旧 inspector 实例(在窗口/renderer 创建前杀旧树,避免缓存重叠期噪音)。
    if (INSPECTOR_MODE) await takeoverOldInspector()
    if (REPLICA_MODE) {
      url = await startReplica()
    } else {
      await ensureServer(PORT)
      url = FIXTURE_MODE ? `http://127.0.0.1:${PORT}/?fixture` : `http://127.0.0.1:${PORT}`
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
