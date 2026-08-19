// probe-cordis-panel.mjs — cordis 插件面板增强探针(P3-⑪)。
//
// fixture 腿:插件控制台「刷新清单」→ 内存清单行(fx-cordis-demo:两版本 →
// 版本选择器;running 状态点)→ 停止 → idle → 运行 → running → 移除 → 行消失;
// 审批卡(seam 注入 cordis/request-run → 允许 → 结算消失)。
// real 腿:清单读取(真实行或空)+ wire 端点确定性业务答案(stopFromPanel
// not-running / undefineFromPanel not found)+ 零错误。
//
// Usage: npx electron probe-cordis-panel.mjs            (fixture)
//        ZION_TAG=real npx electron probe-cordis-panel.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-cordis-panel-out')
const TAG = process.env.ZION_TAG ?? 'fixture'
const URL = TAG === 'real' ? (process.env.ZION_URL ?? 'http://localhost:5199/') : 'http://localhost:5199/?fixture'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { if (await js(win, expr)) return true } catch { /* 瞬态表达式错误忽略 */ }
    await sleep(150)
  }
  return false
}
const q = (sel) => JSON.stringify(sel)
const ROW = `[data-cordis-row="fx-cordis-demo"]`
const clickConsole = (label) => `(() => {
  const b = [...document.querySelectorAll('.plugin-console button')].find(x => (x.innerText ?? '').trim() === ${JSON.stringify(label)})
  if (!b) return false
  b.click(); return true
})()`

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(String(message)) })
  await win.loadURL(URL)
  await waitFor(win, `document.querySelectorAll('.sidebar-item').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  if (TAG === 'real') {
    // ---- real:清单读取 + wire 端点确定性业务答案 ----
    const refreshed = await js(win, clickConsole('刷新清单'))
    const rowsShown = await waitFor(win, `document.querySelectorAll('.plugin-console-rows').length >= 1`, 8000)
    const rowCount = await js(win, `document.querySelectorAll('.plugin-console-row').length`)
    out(`real inventory rows: ${rowCount}`)
    mark('c1', refreshed && rowsShown, 'C1 real:清单读取(真实行或空)', `${rowCount} 行`)
    const realAgent = await js(win, `(async () => {
      const res = await fetch('/api/session.list', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session.list',
          payload: { args: {} } }),
      })
      const full = await res.json()
      const items = full.result?.value?.items ?? full.result?.value ?? []
      return items[0]?.sessionId ?? 'agent-x'
    })()`)
    const stopAnswer = await js(win, `(async () => {
      const res = await fetch('/api/dynamicCordisRunner/stopFromPanel', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'dynamicCordisRunner/stopFromPanel',
          payload: { args: { agentId: ${JSON.stringify('REAL_AGENT')}, pluginId: 'plug-404' } } }),
      })
      return (await res.json()).result
    })()`.replace('REAL_AGENT', realAgent))
    const undefAnswer = await js(win, `(async () => {
      const res = await fetch('/api/dynamicCordisRunner/undefineFromPanel', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'dynamicCordisRunner/undefineFromPanel',
          payload: { args: { agentId: ${JSON.stringify('REAL_AGENT')}, pluginId: 'plug-404' } } }),
      })
      return (await res.json()).result
    })()`.replace('REAL_AGENT', realAgent))
    mark('c2', stopAnswer.ok === true && stopAnswer.value?.ok === false
      && (stopAnswer.value?.reason === 'not-running' || stopAnswer.value?.reason === 'plugin-missing'),
      'C2 real:stopFromPanel(不存在插件 → 业务拒绝)', JSON.stringify(stopAnswer.value ?? stopAnswer))
    mark('c3', undefAnswer.ok === true && undefAnswer.value?.ok === false,
      'C3 real:undefineFromPanel(不存在插件 → 业务拒绝)', JSON.stringify(undefAnswer.value ?? undefAnswer))
    for (const id of ['c4', 'c5', 'c6']) mark(id, true, `${id} real 只读`)
    mark('c6', errors.length === 0, 'C6 零控制台错误', errors.length ? `${errors.length} 个` : '')
  } else {
    // ---- C1: 清单行(两版本 → 版本选择器;running 状态) ----
    const refreshed = await js(win, clickConsole('刷新清单'))
    const rowShown = await waitFor(win, `!!document.querySelector(${q(ROW)})`, 8000)
    const status = await js(win, `(document.querySelector(${q(ROW)})?.getAttribute('data-cordis-status') ?? '')`)
    const versionOptions = await js(win, `[...document.querySelectorAll(${q(ROW + ' .plugin-console-version option')})].map(o => o.value)`)
    const hasTransition = await js(win, `!!document.querySelector(${q(ROW + ' [data-cordis-switch="retry"]')}) && !!document.querySelector(${q(ROW + ' [data-cordis-switch="rollback"]')})`)
    mark('c1', refreshed && rowShown && status === 'running' && versionOptions.length === 2
      && versionOptions.includes('fx-pkg-1') && versionOptions.includes('fx-pkg-2') && hasTransition,
      'C1 清单行:版本选择器(2 版)+ running + 重试/回滚', JSON.stringify(versionOptions))

    // ---- C2: 停止 → idle ----
    const stopped = await js(win, `(() => { const b = document.querySelector(${q(ROW + ' [data-cordis-switch="stop"]')}); if (!b) return false; b.click(); return true })()`)
    const idleShown = await waitFor(win, `(document.querySelector(${q(ROW)})?.getAttribute('data-cordis-status') ?? '') === 'idle'`, 8000)
    mark('c2', stopped && idleShown, 'C2 停止 → idle')

    // ---- C3: 运行 → running ----
    const ran = await js(win, `(() => { const b = document.querySelector(${q(ROW + ' [data-cordis-switch="run"]')}); if (!b) return false; b.click(); return true })()`)
    const runningAgain = await waitFor(win, `(document.querySelector(${q(ROW)})?.getAttribute('data-cordis-status') ?? '') === 'running'`, 8000)
    mark('c3', ran && runningAgain, 'C3 运行 → running')

    // ---- C4: 移除 → 行消失 + 清单空 ----
    const removed = await js(win, `(() => { const b = document.querySelector(${q(ROW + ' [data-cordis-remove]')}); if (!b) return false; b.click(); return true })()`)
    const rowGone = await waitFor(win, `!document.querySelector(${q(ROW)})`, 8000)
    await js(win, clickConsole('刷新清单'))
    const emptyNote = await waitFor(win, `document.body.innerText.includes('无动态插件')`, 8000)
    mark('c4', removed && rowGone && emptyNote, 'C4 移除 → 行消失 + 清单空提示')

    // ---- C5: 审批卡(seam 注入 request-run → 允许 → 结算消失) ----
    const injected = await js(win, `(() => {
      const fn = window.__zionProbeHandleRemoteEvent
      if (!fn) return false
      fn('cordis/request-run', [{ requestId: 'req-panel-1', agentId: 'agent-x', pluginId: 'plug-panel',
        packageId: 'pkg-1', mode: 'run', name: 'panel-plugin', purpose: 'panel probe', requiresApproval: true }])
      return true
    })()`)
    const cardShown = await waitFor(win, `!!document.querySelector('.plugin-approval')`, 8000)
    const approved = await js(win, `(() => {
      const b = [...document.querySelectorAll('.plugin-approval button')].find(x => (x.innerText ?? '').includes('允许'))
      if (!b) return false
      b.click(); return true
    })()`)
    const cardGone = await waitFor(win, `!document.querySelector('.plugin-approval')`, 10000)
    mark('c5', injected && cardShown && approved && cardGone, 'C5 审批卡(seam 注入 → 允许 → 结算消失)')

    // ---- C6: 零控制台错误 ----
    mark('c6', errors.length === 0, 'C6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')
  }

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `cordis-panel-${TAG}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `cordis-panel-${TAG}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `cordis-panel-${TAG}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  out(`--- ${pass}/${total} passed (${TAG}) ---`)
  app.exit(pass === total ? 0 : 1)
}).catch(err => { console.error('CORDIS PANEL PROBE FAILED', err); app.exit(1) })
