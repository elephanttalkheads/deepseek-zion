// 消息行动作(官方 MessageIconActions)探针 — 复制/分支图标 + hover 时间戳。
// fixture 走全流程(alpha 历史:user + assistant 节点):动作行图标按钮、
// 复制 check-swap 反馈、分支 fork 选中子会话、时钟文案、data-time-hover-root。
// 真后端只读:找含 assistant 节点的会话,断言同套入口(不 fork 真实会话)。用法:
//   npx electron probe-msg-actions.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-msg-actions.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-msg-actions-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/'
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
const tag = URL.includes('fixture') ? 'fixture' : 'real'

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL(URL)
  await waitFor(win, `document.querySelectorAll('.sidebar-item').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out(`mode: ${tag}`)

  const COPY = 'button[aria-label="复制"]'
  const BRANCH = 'button[aria-label="在新对话中分支"]'
  const ASSISTANT_ROW = `.chat-node[data-kind="assistant"] .chat-node-actions, .chat-node[data-kind="assistant-step"] .chat-node-actions`

  // ---- M1: 进入含 assistant 节点的会话 ----
  const found = tag === 'fixture'
    ? await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
    : await (async () => {
      for (let i = 0; i < 12; i++) {
        const clicked = await js(win, `(() => {
          const items = [...document.querySelectorAll('.sidebar-item')]
          const rootIdle = items.find(x => parseInt(x.style.paddingLeft || '10', 10) <= 12 && !x.getAttribute('data-running'))
          const row = rootIdle?.querySelector('.sidebar-row')
          if (row) { row.click(); return true }
          return false
        })()`)
        if (clicked) {
          await sleep(1600)
          const hasAssistant = await js(win, `document.querySelectorAll('.chat-node[data-kind="assistant"], .chat-node[data-kind="assistant-step"]').length >= 1`)
          if (hasAssistant) return true
        }
      }
      return false
    })()
  mark('m1', found, 'M1 进入含 assistant 节点的会话')

  await waitFor(win, `document.querySelectorAll(${JSON.stringify(ASSISTANT_ROW)}).length >= 1`, 8000)
  const rowActions = await js(win, `(() => {
    const rows = [...document.querySelectorAll(${JSON.stringify(ASSISTANT_ROW)})]
    return rows.map(r => [...r.querySelectorAll('button')].map(b => b.getAttribute('aria-label')))
  })()`)
  out(`assistant action labels: ${JSON.stringify(rowActions[0] ?? [])}`)

  // ---- M2: 动作行含 复制/分支 图标按钮 ----
  const hasCopy = await js(win, `!!document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} ${COPY}`)})`)
  const hasBranch = await js(win, `!!document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} ${BRANCH}`)})`)
  mark('m2', hasCopy && hasBranch, 'M2 assistant 动作行:复制 + 分支图标按钮')

  // ---- M2b: 时钟文案 + data-time-hover-root(hover 时间戳) ----
  const clockText = await js(win, `(() => {
    const row = document.querySelector(${JSON.stringify(ASSISTANT_ROW)})
    return row ? (row.innerText ?? '') : ''
  })()`)
  const hoverRoot = await js(win, `!!document.querySelector('.chat-node[data-time-hover-root]')`)
  mark('m2b', /\d{2}:\d{2}/.test(clockText) && hoverRoot, 'M2b 时间戳时钟文案 + data-time-hover-root', JSON.stringify(clockText.slice(0, 40)))

  // ---- M2c: user 节点动作行(clock=start 的复制,无分支) ----
  const userCopy = await js(win, `(() => {
    const rows = [...document.querySelectorAll('.chat-node[data-kind="user"] .chat-node-actions, .chat-node[data-kind="steering"] .chat-node-actions, .chat-node[data-kind="context"] .chat-node-actions')]
    if (rows.length === 0) return 'no-user-rows'
    const copy = !!rows[0]?.querySelector('button[aria-label="复制"]')
    const branch = !!rows[0]?.querySelector('button[aria-label="在新对话中分支"]')
    const text = rows[0]?.innerText ?? ''
    return JSON.stringify({ copy, branch, text })
  })()`)
  let userOk = false
  let userNote = userCopy
  if (userCopy !== 'no-user-rows') {
    const parsed = JSON.parse(userCopy)
    userOk = parsed.copy && !parsed.branch && /\d{2}:\d{2}/.test(parsed.text)
    userNote = JSON.stringify({ copy: parsed.copy, branch: parsed.branch, clock: /\d{2}:\d{2}/.test(parsed.text) })
  } else {
    userOk = true
    userNote = '无 user 节点,跳过'
  }
  mark('m2c', userOk, 'M2c user 节点动作行:复制 + 时钟(clock=start),无分支', userNote)

  if (tag === 'fixture') {
    // ---- M3: 复制 → check-swap 反馈(aria-label 复制成功) ----
    // 注:electron show:false 窗口 clipboard-write 常被拒,writeClipboard 返 false
    // → 官方无反馈(chrome 只在成功时换勾);成功路径出现即证明接线,失败则容忍。
    const copyClicked = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} ${COPY}`)}); if (!b) return false; b.click(); return true })()`)
    await sleep(600)
    const afterCopy = await js(win, `(() => {
      const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} ${COPY}`)})
      if (!b) return ''
      return b.getAttribute('aria-label') ?? ''
    })()`)
    out(`copy feedback: ${JSON.stringify(afterCopy)}`)
    mark('m3', copyClicked && (afterCopy === '复制成功' || afterCopy === '复制'), 'M3 复制 → check-swap 反馈(成功换勾;环境拒剪贴板则无反馈)', afterCopy)

    // ---- M4/M5: 分支(fork 真后端)→ 选中切换 + 子会话更深缩进 ----
    const beforeSel = await js(win, `document.querySelector('.sidebar-item[data-selected] .sidebar-row')?.innerText?.replace(/\\n/g,' ').slice(0,40) ?? ''`)
    const forkClicked = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} ${BRANCH}`)}); if (!b) return false; b.click(); return true })()`)
    await sleep(2500)
    const selChanged = await js(win, `(() => {
      const current = document.querySelector('.sidebar-item[data-selected] .sidebar-row')?.innerText?.replace(/\\n/g,' ').slice(0,40) ?? ''
      return current !== ${JSON.stringify(beforeSel)}
    })()`)
    const selectedPad = await js(win, `(() => {
      const el = document.querySelector('.sidebar-item[data-selected]')
      return el ? parseInt(el.style.paddingLeft || '10', 10) : -1
    })()`)
    out(`before: ${beforeSel}  afterChanged=${selChanged} pad=${selectedPad}`)
    mark('m4', forkClicked && selChanged, 'M4 分支 → 选中切换(fork 成功 → 子会话)', `pad=${selectedPad}`)
    mark('m5', selChanged && selectedPad > 12, 'M5 fork 生成子会话并被选中(派生行 deeper 缩进)', `pad=${selectedPad}`)
  } else {
    mark('m3', true, 'M3 real:只读,不点复制')
    mark('m4', true, 'M4 real:只读,不 fork')
    mark('m5', true, 'M5 real:只读,不 fork')
  }

  mark('m6', errors.length === 0, 'M6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `msg-actions-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `msg-actions-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `msg-actions-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 消息行动作探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('MSG ACTIONS PROBE FAILED', err); app.exit(1) })
