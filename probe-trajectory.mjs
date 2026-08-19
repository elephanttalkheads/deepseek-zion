// 轨迹视图(TrajectoryView)接入探针 — fixture 模式验证:
//   会话头 tabs(chat/轨迹)存在、切到轨迹后官方 vendor 组件挂载(工具栏/搜索/时间轴/表格)、
//   切回 chat 恢复、无控制台错误。用法: npx electron probe-trajectory.mjs
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

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/?fixture')
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
  await sleep(1500)

  out('--- 会话头 tabs ---')
  const tabs = await js(win, `[...document.querySelectorAll('.conversation-header-tab')].map(b => b.innerText)`)
  out(`tabs: ${JSON.stringify(tabs)}`)
  mark('t1', tabs.includes('Chat') && tabs.some(x => x.includes('轨迹')), 'T1 会话头含 Chat/轨迹 两个视图标签', `tabs=${JSON.stringify(tabs)}`)

  out('--- 切到轨迹视图 ---')
  const clicked = await js(win, `(() => {
    const b = [...document.querySelectorAll('.conversation-header-tab')].find(x => x.innerText.includes('轨迹'))
    if (b) { b.click(); return true }
    return false
  })()`)
  mark('t2', clicked, 'T2 点击轨迹标签')
  await sleep(1200)

  out('--- TrajectoryView 挂载断言 ---')
  const viewMarked = await js(win, `document.querySelector('.conversation-header[data-session-view="trajectory"]') !== null`)
  mark('t3', viewMarked, 'T3 会话头 data-session-view=trajectory')
  const toolbar = await waitFor(win, `!!document.querySelector('[aria-label="轨迹工具栏"]')`, 8000)
  mark('t4', toolbar, 'T4 TrajectoryToolbar 挂载(aria-label 轨迹工具栏)')
  const search = await js(win, `!!document.querySelector('input[placeholder="搜索"]')`)
  mark('t5', search, 'T5 轨迹搜索输入框(placeholder=搜索)')
  const chatHidden = await js(win, `document.querySelector('.conversation-chat') === null`)
  mark('t6', chatHidden, 'T6 切轨迹后 chat 区块卸载')
  const rowsCount = await js(win, `document.querySelectorAll('.conversation-header-tab').length`)
  mark('t7', rowsCount === 2, 'T7 tabs 仍为 2 个')

  out('--- 切回 chat ---')
  const back = await js(win, `(() => {
    const b = [...document.querySelectorAll('.conversation-header-tab')].find(x => x.innerText === 'Chat')
    if (b) { b.click(); return true }
    return false
  })()`)
  mark('t8', back, 'T8 切回 Chat 标签')
  await sleep(800)
  const chatBack = await js(win, `!!document.querySelector('.conversation-chat')`)
  mark('t9', chatBack, 'T9 chat 区块恢复渲染')

  mark('t10', errors.length === 0, 'T10 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  // 轨迹视图截图
  await js(win, `[...document.querySelectorAll('.conversation-header-tab')].find(x => x.innerText.includes('轨迹')).click()`)
  await sleep(1200)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'trajectory.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'trajectory.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'trajectory-errors.txt'), errors.join('\n'))

  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 轨迹视图探针: ${pass}/10 pass ==`)
  app.quit()
}).catch(err => { console.error('TRAJECTORY PROBE FAILED', err); app.exit(1) })
