// 轨迹视图真后端核验 — 加载 replica(5199,代理 3080),选最新真实会话,切轨迹视图,
// 断言官方组件挂载 + 轨迹表格/时间轴有实际内容 + 零控制台错误。
// 用法: npx electron probe-trajectory-real.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-trajectory-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 12000, every = 500) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}

fs.mkdirSync(OUT, { recursive: true })
const TAG = 'trajectory-real'

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out(`badge: ${await js(win, `document.querySelector('.shell-badge')?.innerText ?? ''`)}`)
  const firstRow = await js(win, `document.querySelector('.sidebar-row')?.innerText?.replace(/\\n/g,' ') ?? ''`)
  out(`first row: ${firstRow}`)
  await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
  await sleep(2500)

  await waitFor(win, `document.querySelectorAll('.conversation-header-tab').length >= 2`, 8000)
  mark('r1', (await js(win, `document.querySelectorAll('.conversation-header-tab').length`)) >= 2, 'R1 会话头含 chat/轨迹 标签')

  const clicked = await js(win, `(() => {
    const b = [...document.querySelectorAll('.conversation-header-tab')].find(x => x.innerText.includes('轨迹'))
    if (b) { b.click(); return true } return false
  })()`)
  mark('r2', clicked, 'R2 点击轨迹标签')
  const toolbar = await waitFor(win, `!!document.querySelector('[aria-label="轨迹工具栏"]')`, 8000)
  mark('r3', toolbar, 'R3 TrajectoryToolbar 挂载')
  await sleep(1500)

  const viewText = await js(win, `(() => {
    const root = document.querySelector('.conversation-header[data-session-view="trajectory"]')?.parentElement
    return root ? root.innerText.slice(0, 1500) : ''
  })()`)
  out(`trajectory view innerText (1500):`)
  out(viewText || '(empty)')
  const hasContent = viewText.length > 50
  mark('r4', hasContent, 'R4 轨迹视图有实际内容(非空)', `len=${viewText.length}`)
  const modelMention = /opencode-go|deepseek-v4-flash|DeepSeek|assistant/i.test(viewText)
  mark('r5', modelMention, 'R5 轨迹文本含模型/提供方标识或回合内容')
  mark('r6', errors.length === 0, 'R6 零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${TAG}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `${TAG}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `${TAG}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 轨迹视图真后端核验: ${pass}/6 pass ==`)
  app.quit()
}).catch(err => { console.error('REAL TRAJECTORY PROBE FAILED', err); app.exit(1) })
