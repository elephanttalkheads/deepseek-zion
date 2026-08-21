// ============================================================
// probe-queue-activation.mjs — 队列激活探针(真后端专属)。
//
// 背景:官方 fixture 不发射 session/queue 帧(queue RPC 只有 edit/steer/remove
// 且对空队列拒绝)→ 队列只能在真实后端激活:会话运行中再发一条 prompt →
// 官方宿主入队并推送 → QueueDock(data-queue-dock)渲染。
//
// 本探针复用 inspector 配方引擎(page-panel.js + recipes.js 同款注入),
// 驱动官方原版 3080 页面完成真实排队并断言:
//   Q1 队列激活配方执行成功(第二条在运行中入队)
//   Q2 [data-queue-dock] 可见渲染
//   Q3 排队行含第二条消息文本
//   Q4 行内动作齐备(编辑排队消息 / 删除排队消息 / 插话发送)
//   Q5 截图已存 probe-queue-activation-out/queue-active.png
//   Q6 清理:停止运行(如有)+ 移除排队行
//   Q7 全程零控制台错误
//
// 副作用:真后端会真实发起一个长生成回合 + 一条排队消息(等价人工操作);
// 探针结束自动清理排队行,会话保留(可自行归档)。
//
// 用法:
//   npx electron probe-queue-activation.mjs
//   $env:ZION_URL='http://127.0.0.1:3080/' npx electron probe-queue-activation.mjs
// ============================================================
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-queue-activation-out')
const URL = process.env.ZION_URL ?? 'http://127.0.0.1:3080/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 10000, every = 400) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}
/** 页内执行 + 错误包装(配方抛错也能取回消息)。 */
const call = (win, expr) => js(win, `(async () => {
  try { return { __ok: true, value: await (${expr}) } }
  catch (e) { return { __ok: false, error: String(e && e.message || e) } }
})()`)

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    x: -32000, y: -32000, // 屏外:capturePage 可用又不打扰桌面
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  win.webContents.setBackgroundThrottling(false) // 屏外窗口节流会卡死等待
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  await win.loadURL(URL)
  const booted = await waitFor(win, '!!window.__DSH_MODULES__', 60000)
  if (!booted) {
    out(`❌ 页面 60s 内未完成 boot(window.__DSH_MODULES__ 缺失)—— 3080 真后端在跑吗?URL=${URL}`)
    fs.writeFileSync(path.join(OUT, 'queue-activation.txt'), lines.join('\n'))
    app.exit(1)
    return
  }

  // 注入 inspector 配方引擎(与 main.mjs injectInspectorBundle 同款)
  const bundle = 'window.__ZION_INSPECTOR_MANIFEST__ = ' + fs.readFileSync(path.join(__dirname, 'inspector', 'manifest.json'), 'utf8') + ';\n'
    + fs.readFileSync(path.join(__dirname, 'inspector', 'page-panel.js'), 'utf8') + '\n'
    + fs.readFileSync(path.join(__dirname, 'inspector', 'recipes.js'), 'utf8') + '\n'
    + 'void 0;\n'
  await js(win, bundle)

  // 真实模式欢迎弹窗(如未确认过):点「继续」(真实模式可持久化,能关掉)
  await js(win, `(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const btn = dialog ? [...dialog.querySelectorAll('button')].find((b) => /^(继续|继续使用|continue)/i.test((b.textContent || '').trim())) : null
    if (btn) { btn.click(); return true }
    return false
  })()`)
  await sleep(1200)

  // Q1 队列激活:配方内部完成 选会话/新建 → 长任务 → 等运行 → 第二条入队 → 等 QueueDock
  const recipe = await call(win, `window.__zionInspector.recipe('queue-dock')`)
  mark('q1', recipe.__ok, 'Q1 队列激活配方执行(第二条在运行中入队)', recipe.__ok ? (recipe.value?.note || '') : recipe.error)

  // Q2 可见渲染
  const vis = await js(win, `(() => {
    const el = document.querySelector('[data-queue-dock]')
    if (!el) return { found: false }
    const r = el.getBoundingClientRect()
    return { found: true, w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText || '').slice(0, 90) }
  })()`)
  mark('q2', vis.found && vis.w > 100 && vis.h > 20, 'Q2 [data-queue-dock] 可见渲染', JSON.stringify(vis))

  // Q3 排队行内容
  mark('q3', vis.found && /第二条/.test(vis.text), 'Q3 排队行含第二条消息文本', vis.found ? vis.text : '')

  // Q4 行内动作齐备(官方 QueueDock aria-labels)
  const actions = await js(win, `(() => {
    const d = document.querySelector('[data-queue-dock]')
    if (!d) return {}
    const aria = [...d.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || '')
    return {
      edit: aria.includes('编辑排队消息'),
      remove: aria.includes('删除排队消息'),
      steer: aria.includes('插话发送'),
      steerDisabled: (() => { const b = [...d.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === '插话发送'); return b ? b.disabled : null })(),
    }
  })()`)
  mark('q4', actions.edit && actions.remove && actions.steer, 'Q4 行内动作齐备(编辑/删除/插话发送)', JSON.stringify(actions))

  // Q5 截图
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'queue-active.png'), shot.toPNG())
  const size = shot.getSize()
  mark('q5', size.width > 0 && size.height > 0, 'Q5 截图已存 probe-queue-activation-out/queue-active.png', `${size.width}x${size.height}`)

  // Q6 清理:停止运行(如有)+ 移除排队行
  const clean = await call(win, `window.__zionInspector.recipe('queue-dock-clean')`)
  const gone = await waitFor(win, `document.querySelectorAll('[data-queue-dock]').length === 0`, 10000)
  mark('q6', clean.__ok && gone, 'Q6 清理:排队行移除', clean.__ok ? (clean.value?.note || '') : (clean.error || ''))

  mark('q7', errors.length === 0, 'Q7 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const pass = Object.values(results).filter(Boolean).length
  out(`\n== QueueActivation 探针: ${pass}/${Object.keys(results).length} pass ==`)
  fs.writeFileSync(path.join(OUT, 'queue-activation.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'queue-activation-errors.txt'), errors.join('\n'))
  app.exit(pass === Object.keys(results).length ? 0 : 1)
}).catch((err) => {
  console.error('QUEUE-ACTIVATION PROBE FAILED', err)
  app.exit(1)
})
