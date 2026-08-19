// 消息行动作(复制/分支)探针 — 真后端:选含 assistant 节点的会话,
// 断言 .chat-node-actions 入口行(复制/分支按钮),点击后出现反馈 note;fork 真后端
// 生成子会话并切换选择。用法: npx electron probe-msg-actions.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-msg-actions-out')
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
  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-item').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  // 依次点击根级空闲会话,直到出现 assistant 节点(或有 assistant 动作入口)
  const found = await (async () => {
    for (let i = 0; i < 12; i++) {
      const clickedReal = await js(win, `(() => {
        const items = [...document.querySelectorAll('.sidebar-item')]
        const rootIdle = items.find(x => parseInt(x.style.paddingLeft || '10', 10) <= 12 && !x.getAttribute('data-running'))
        const row = rootIdle?.querySelector('.sidebar-row')
        if (row) { row.click(); return true }
        return false
      })()`)
      if (clickedReal) {
        await sleep(1600)
        const hasAssistant = await js(win, `document.querySelectorAll('.chat-node[data-kind="assistant"], .chat-node[data-kind="assistant-step"]').length >= 1`)
        if (hasAssistant) return true
      }
    }
    return false
  })()
  mark('m1', found, 'M1 找到含 assistant 节点的会话')

  await waitFor(win, `document.querySelectorAll('.chat-node-actions').length >= 1`, 8000)
  const actionBtns = await js(win, `[...document.querySelector('.chat-node-actions')?.querySelectorAll('button') ?? []].map(b => (b.innerText || '').trim())`)
  out(`action buttons: ${JSON.stringify(actionBtns)}`)
  mark('m2', actionBtns.includes('复制') && actionBtns.includes('分支'), 'M2 消息行动作行含 复制/分支', JSON.stringify(actionBtns))

  // 复制
  await js(win, `(() => { const b = [...document.querySelector('.chat-node-actions')?.querySelectorAll('button') ?? []].find(x => x.innerText === '复制'); if (b) b.click(); return !!b })()`)
  await sleep(700)
  const copyNote = await js(win, `document.querySelector('.chat-view-action-note')?.innerText ?? ''`)
  out(`copy note: ${JSON.stringify(copyNote)}`)
  mark('m3', copyNote !== '' && (copyNote.includes('已复制') || copyNote.includes('复制失败') || copyNote.includes('无可复制')), 'M3 点击复制有反馈(note)', copyNote)

  // 分支(fork 真后端)
  const beforeSel = await js(win, `document.querySelector('.sidebar-item[data-selected] .sidebar-row')?.innerText?.replace(/\\n/g,' ').slice(0,40) ?? ''`)
  const forkClicked = await js(win, `(() => { const b = [...document.querySelector('.chat-node-actions')?.querySelectorAll('button') ?? []].find(x => x.innerText === '分支'); if (b) { b.click(); return true } return false })()`)
  await sleep(2500)
  const forkNote = await js(win, `document.querySelector('.chat-view-action-note')?.innerText ?? ''`)
  const selectedPad = await js(win, `(() => {
    const el = document.querySelector('.sidebar-item[data-selected]')
    return el ? parseInt(el.style.paddingLeft || '10', 10) : -1
  })()`)
  const selChanged = await js(win, `(() => {
    const current = document.querySelector('.sidebar-item[data-selected] .sidebar-row')?.innerText?.replace(/\\n/g,' ').slice(0,40) ?? ''
    return current !== ${JSON.stringify(beforeSel)}
  })()`)
  out(`before: ${beforeSel}  afterChanged=${selChanged} pad=${selectedPad} note=${JSON.stringify(forkNote)}`)
  mark('m4', forkClicked && selChanged, 'M4 点击分支后选中切换(fork 成功 → 子会话)', `pad=${selectedPad}`)
  mark('m5', selChanged && selectedPad > 12, 'M5 fork 生成子会话并被选中(派生行 deeper 缩进)', `pad=${selectedPad}`)

  mark('m6', errors.length === 0, 'M6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'msg-actions.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'msg-actions.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'msg-actions-errors.txt'), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 消息行动作探针: ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('MSG ACTIONS PROBE FAILED', err); app.exit(1) })
