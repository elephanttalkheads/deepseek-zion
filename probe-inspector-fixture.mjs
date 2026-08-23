// Component inspector regression probe (official 3080 UI + fixture backend).
//
// This deliberately starts the real `main.mjs --inspector` path instead of
// injecting inspector/page-panel.js itself.  It catches regressions in the
// early module-system capture, panel injection, fixture welcome dismissal and
// a real overlay mount in one unattended loop.
//
// Usage: node probe-inspector-fixture.mjs
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ELECTRON = require('electron')
const TIMEOUT_MS = Number(process.env.ZION_INSPECTOR_PROBE_TIMEOUT_MS || 30_000)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let activeChild = null
let activeCdp = null
let activeUserDataDir = null
let activeCleanup = null

function canConnect(port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForPageTarget(port, child, deadline) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron 提前退出(exit ${child.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(800),
      })
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page' && /127\.0\.0\.1:3080/.test(target.url))
      if (page?.webSocketDebuggerUrl) return page
    } catch { /* 远程调试口仍在启动 */ }
    await sleep(150)
  }
  throw new Error('等待官方 3080 页面 CDP target 超时')
}

async function connectCdp(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')), { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('CDP WebSocket 已关闭'))
    pending.clear()
  })
  return {
    close: () => socket.close(),
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function evaluate(cdp, expression) {
  const response = await cdp.call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (response.exceptionDetails) {
    const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text
    throw new Error(detail || '页面表达式执行失败')
  }
  return response.result?.value
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  let stopped = false
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' })
      stopped = true
    } catch { /* 受限环境下退回父进程句柄 */ }
  }
  if (!stopped) child.kill()
  const deadline = Date.now() + 2_000
  while (child.exitCode === null && Date.now() < deadline) await sleep(100)
}

function removeProbeTemp(userDataDir) {
  if (!userDataDir) return
  const tempRoot = path.resolve(os.tmpdir()) + path.sep
  const resolved = path.resolve(userDataDir)
  if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('zion-inspector-probe-')) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch { /* Chromium 句柄会延迟释放 */ }
  }
}

function cleanupActiveRun() {
  if (activeCleanup) return activeCleanup
  activeCleanup = (async () => {
    try {
      await Promise.race([activeCdp?.call('Browser.close') || Promise.resolve(), sleep(700)])
      await sleep(200)
    } catch { /* target already gone */ }
    try { activeCdp?.close() } catch { /* ignore */ }
    await stopChild(activeChild)
    removeProbeTemp(activeUserDataDir)
    activeCdp = null
    activeChild = null
    activeUserDataDir = null
  })()
  return activeCleanup
}

for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => { void cleanupActiveRun().finally(() => process.exit(exitCode)) })
}

async function main() {
  if (!await canConnect(3080)) {
    throw new Error('3080 官方服务未运行；探针为保护现有会话不会自行拉起或重启后端')
  }

  const debugPort = await freePort()
  let controlPort = await freePort()
  while (controlPort === debugPort) controlPort = await freePort()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zion-inspector-probe-'))
  activeUserDataDir = userDataDir
  const logs = []
  const restrictedAgentFlags = process.env.CODEX_CI === '1' ? ['--disable-gpu', '--no-sandbox'] : []
  let child
  let cdp
  try {
    child = spawn(ELECTRON, [
      ROOT,
      '--inspector',
      '--fixture',
      '--hidden',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      // Codex CI itself runs inside a Windows sandbox that cannot launch a
      // nested Chromium GPU sandbox. Normal developer runs keep Electron's
      // production sandbox; the restricted-agent fallback is test-process only.
      ...restrictedAgentFlags,
    ], {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ZION_INSPECTOR_PROBE_CONTROL_PORT: String(controlPort) },
    })
    activeChild = child
    const collect = (chunk) => {
      logs.push(...String(chunk).split(/\r?\n/).filter(Boolean))
      if (logs.length > 100) logs.splice(0, logs.length - 100)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)

    const deadline = Date.now() + TIMEOUT_MS
    const target = await waitForPageTarget(debugPort, child, deadline)
    cdp = await connectCdp(target.webSocketDebuggerUrl)
    activeCdp = cdp
    await cdp.call('Runtime.enable')
    await cdp.call('Page.enable')

    let state = null
    let dialogSeenByProbe = false
    while (Date.now() < deadline) {
      state = await evaluate(cdp, `(() => {
        const dialog = document.querySelector('[role="dialog"]')
        const text = dialog?.textContent || ''
        const inspector = window.__zionInspector
        const status = inspector?.status?.() || null
        const launcher = document.querySelector('#zion-inv-launcher')
        const rect = launcher?.getBoundingClientRect()
        return {
          ready: !!inspector,
          status,
          canImport: typeof window.__ZION_INSPECTOR_MODULES__?.import === 'function',
          launcherText: launcher?.textContent || '',
          launcherVisible: !!rect && rect.width > 0 && rect.height > 0,
          dialogText: text.slice(0, 240),
        }
      })()`)
      if (/内测声明|欢迎使用|welcome/i.test(state?.dialogText || '')) dialogSeenByProbe = true
      if (state?.ready && state.status?.recipes?.includes('goal-bar')) break
      await sleep(200)
    }

    const checks = []
    const check = (id, ok, note) => checks.push({ id, ok: !!ok, note })
    check('inspector-ready', state?.ready, '真实 main.mjs 已注入召唤器 API')
    check('launcher-visible', state?.launcherVisible && /组件/.test(state?.launcherText || ''), '「⿻ 组件」入口可见')
    check('module-system-captured', state?.canImport && state?.status?.modules, '已捕获带 import() 的真实 ClientModuleSystem')
    check('fixture-recipes-ready', state?.status?.fixture && state?.status?.recipes?.includes('goal-bar'), 'fixture 模式及配方已就绪')

    let overlay = null
    if (state?.ready && state?.canImport) {
      overlay = await evaluate(cdp, `(async () => {
        try {
          const result = await window.__zionInspector.recipe('goal-bar')
          const mount = document.querySelector('#zion-inv-mount')
          const rect = mount?.getBoundingClientRect()
          return {
            ok: true,
            mode: result.mode,
            recipeId: result.recipeId,
            visible: !!rect && rect.width > 0 && rect.height > 0 && mount.childElementCount > 0,
          }
        } catch (error) {
          return { ok: false, error: String(error?.message || error) }
        }
      })()`)
    }
    check('overlay-mount', overlay?.ok && overlay.mode === 'overlay' && overlay.recipeId === 'goal-bar' && overlay.visible,
      overlay?.error || '真实模块导入 + 官方 React 组件挂载成功')
    if (overlay?.ok) await evaluate(cdp, 'window.__zionInspector.close()')

    let welcome = null
    if (state?.ready) {
      const welcomeDeadline = Math.min(deadline, Date.now() + 5_000)
      do {
        welcome = await evaluate(cdp, `(() => {
          const dialog = document.querySelector('[role="dialog"]')
          const text = dialog?.textContent || ''
          const root = document.getElementById('root')
          const candidates = root ? [...root.querySelectorAll('button, textarea, input, [tabindex]')].filter((element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.pointerEvents !== 'none'
          }) : []
          const rootReachable = candidates.some((element) => {
            const rect = element.getBoundingClientRect()
            const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
            return top === element || element.contains(top)
          })
          return {
            trace: window.__zionInspector?.status?.().welcome || null,
            blocked: /内测声明|欢迎使用|welcome/i.test(text),
            persistError: document.body.innerText.includes('暂时无法保存确认状态，请重试。'),
            rootInert: root?.hasAttribute('inert') || false,
            rootReachable,
          }
        })()`)
        if (!welcome.blocked && !welcome.persistError && !welcome.rootInert && welcome.rootReachable) break
        await sleep(200)
      } while (Date.now() < welcomeDeadline)
    }
    if (welcome && !welcome.blocked && !welcome.rootInert) {
      welcome.launcherClickable = await evaluate(cdp, `(() => {
        const launcher = document.querySelector('#zion-inv-launcher')
        const panel = document.querySelector('#zion-inv-panel')
        if (!launcher || !panel) return false
        const wasOpen = panel.classList.contains('zion-iv-open')
        if (!wasOpen) launcher.click()
        const opened = panel.classList.contains('zion-iv-open')
        if (!wasOpen && opened) launcher.click()
        return opened
      })()`)
    }
    const trace = welcome?.trace
    check('welcome-path-observed', dialogSeenByProbe || (trace?.seen > 0 && trace?.continueClicked > 0), '已覆盖 fixture 内测声明关闭路径')
    check('welcome-unblocked', welcome && !welcome.blocked && !welcome.persistError && !welcome.rootInert
      && welcome.rootReachable && welcome.launcherClickable && trace?.continueClicked > 0,
      '弹窗及保存失败提示均已清除（官方可持久化或 fixture 兜底均可）')

    let reload = null
    if (state?.ready) {
      const reloadToken = `zion-reload-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const reloadTokenJs = JSON.stringify(reloadToken)
      const oldTimeOrigin = await evaluate(cdp, `(() => {
        window.__zionInspectorProbeDocument = ${reloadTokenJs}
        return performance.timeOrigin
      })()`)
      const oldTimeOriginJs = JSON.stringify(oldTimeOrigin)
      await cdp.call('Page.reload', { ignoreCache: true })
      const reloadDeadline = Date.now() + Math.min(TIMEOUT_MS, 15_000)
      while (Date.now() < reloadDeadline) {
        try {
          reload = await evaluate(cdp, `(() => {
            const inspector = window.__zionInspector
            const launcher = document.querySelector('#zion-inv-launcher')
            const rect = launcher?.getBoundingClientRect()
            return {
              ready: !!inspector,
              modules: inspector?.status?.().modules || false,
              recipes: inspector?.status?.().recipes || [],
              launcherVisible: !!rect && rect.width > 0 && rect.height > 0,
              documentChanged: window.__zionInspectorProbeDocument !== ${reloadTokenJs}
                && performance.timeOrigin !== ${oldTimeOriginJs},
            }
          })()`)
          if (reload?.documentChanged && reload.ready && reload.modules
            && reload.recipes.includes('goal-bar-paused') && reload.launcherVisible) break
        } catch { /* 页面正在重建 execution context */ }
        await sleep(200)
      }
      if (reload?.documentChanged && reload.ready && reload.modules) {
        reload.overlay = await evaluate(cdp, `(async () => {
          try {
            const result = await window.__zionInspector.recipe('goal-bar-paused')
            const mount = document.querySelector('#zion-inv-mount')
            return result.recipeId === 'goal-bar-paused' && !!mount?.childElementCount
          } catch { return false }
        })()`)
      }
    }
    check('reload-reinject', reload?.documentChanged && reload.ready && reload.modules && reload.launcherVisible && reload.overlay,
      '整页刷新后重新捕获模块系统、注入入口并挂载组件')

    const passed = checks.filter((item) => item.ok).length
    console.log(JSON.stringify({
      passed,
      total: checks.length,
      checks,
      status: state?.status || null,
      welcome: welcome || null,
      overlay,
      reload,
    }, null, 2))
    if (passed !== checks.length) {
      console.error(`inspector probe failed (${passed}/${checks.length})`)
      if (logs.length) console.error(logs.slice(-12).join('\n'))
      process.exitCode = 1
    }
  } finally {
    // Gracefully close the BrowserWindow, then fall back to the exact spawned
    // PID/tree. Signal handlers reuse the same idempotent cleanup path.
    await cleanupActiveRun()
  }
}

main().catch((error) => {
  console.error(`inspector probe failed: ${error.message}`)
  process.exitCode = 1
})
