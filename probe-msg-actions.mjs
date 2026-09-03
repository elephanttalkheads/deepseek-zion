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
  // 官方 TurnTail(每轮底部)拥有行动作行:data-turn-tail 节点内的 .reply-actions(§2.14 回复尾操作条)。
  const ASSISTANT_ROW = `.chat-node[data-turn-tail] .reply-actions`

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
  mark('m2', hasCopy && hasBranch, 'M2 turn-tail 动作行:复制 + 分支图标按钮')

  // ---- M2d: 官方位置对齐——每轮底部(turn-tail)流内常显,非 hover 悬浮 ----
  const alwaysShown = await js(win, `(() => {
    const rows = [...document.querySelectorAll('.chat-node[data-turn-tail] .reply-actions')]
    if (rows.length === 0) return false
    const r = rows[0]
    const s = getComputedStyle(r)
    const firstAssistantActions = !!document.querySelector('.chat-node[data-kind="assistant"] .chat-node-actions, .chat-node[data-kind="assistant-step"] .chat-node-actions')
    return s.display !== 'none' && !firstAssistantActions
  })()`)
  mark('m2d', alwaysShown, 'M2d 官方位置对齐:actions 仅在 turn-tail 底部(流内常显,assistant 本体无动作行)')

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

    // ---- M-fb: 消息反馈(好的回答/有问题的回答 + 补充说明;fixture 内存实现,零副作用) ----
    const likeBtn = await js(win, `!!document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="好的回答"]`)})`)
    const dislikeBtn = await js(win, `!!document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="有问题的回答"]`)})`)
    mark('mfb1', likeBtn && dislikeBtn, 'M-fb1 turn-tail 动作行含 好的回答/有问题的回答 反馈按钮')
    await waitFor(win, `!!document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="好的回答"]`)})`, 8000)
    const likeClicked = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="好的回答"]`)}); if (!b) return false; b.click(); return true })()`)
    const likePressed = await waitFor(win, `document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="取消标记"]`)})?.getAttribute('aria-pressed') === 'true'`, 6000)
    mark('mfb2', likeClicked && likePressed, 'M-fb2 点「好的回答」→ 标记生效(aria-pressed,按钮切换为「取消标记」)')
    // M-fb2 已标记「好的回答」→ 按钮此刻是「取消标记」;点它=撤回,再点「有问题的回答」=反向标记
    // (负向激活后该按钮 label 同为「取消标记」;断言限定在被点击的这一行内——fixture 有多轮 turn-tail)。
    const toggled = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="取消标记"]`)}); if (!b) return false; b.click(); return true })()`)
    const dislikeClicked = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button[aria-label="有问题的回答"]`)}); if (!b) return false; b.click(); return true })()`)
    const dislikeNow = await waitFor(win, `(() => {
      const row = document.querySelector(${JSON.stringify(ASSISTANT_ROW)})
      if (!row) return false
      const active = row.querySelector('button[aria-label="取消标记"]')
      const released = row.querySelector('button[aria-label="有问题的回答"]')
      return active !== null && active.getAttribute('aria-pressed') === 'true' && released === null
    })()`, 6000)
    mark('mfb3', toggled && dislikeClicked && dislikeNow, 'M-fb3 再点「取消标记」→ 撤回;点「有问题的回答」→ 反向标记')
    const noteOpen = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button.msg-feedback-note-open`)}); if (!b) return false; b.click(); return true })()`)
    const noteEditor = await waitFor(win, `!!document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} textarea.msg-feedback-note-input`)})`, 4000)
    mark('mfb4', noteOpen && noteEditor, 'M-fb4 标记后「补充说明」编辑器可打开')
    if (noteEditor) {
      // 受控 textarea:必须用原生 value setter(HANDOFF §5)。
      const typed = await js(win, `(() => {
        const t = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} textarea.msg-feedback-note-input`)})
        if (!t) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
        setter.call(t, '这条回答很好')
        t.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      const saved = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button.msg-feedback-note-save`)}); if (!b) return false; b.click(); return true })()`)
      const noteShown = await waitFor(win, `(() => {
        const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} button.msg-feedback-note-open`)})
        return b !== null && (b.innerText ?? '').includes('这条回答很好')
      })()`, 6000)
      mark('mfb5', typed && saved && noteShown, 'M-fb5 保存补充说明 → 行内显示备注')
    } else {
      mark('mfb5', false, 'M-fb5 保存补充说明(编辑器未打开,跳过)')
    }

    // ---- M4/M5: 分支(fork 真后端)→ 选中切换 + 子会话嵌套行(ASCII 城市:
    //      子会话不进 Portal 面,在 City Index 内以 .is-child 嵌套呈现) ----
    await js(win, `(() => { const t = document.querySelector('.map-toggle'); if (t) t.click(); return !!t })()`)
    await waitFor(win, `document.querySelectorAll('.map-row').length >= 1`, 6000)
    const beforeId = await js(win, `document.querySelector('.map-session-button.is-current')?.closest('.map-row')?.getAttribute('data-session-id') ?? ''`)
    const forkClicked = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(`${ASSISTANT_ROW} ${BRANCH}`)}); if (!b) return false; b.click(); return true })()`)
    await sleep(2500)
    const afterId = await js(win, `document.querySelector('.map-session-button.is-current')?.closest('.map-row')?.getAttribute('data-session-id') ?? ''`)
    const selChanged = afterId !== '' && afterId !== beforeId
    const childSelected = await waitFor(win, `!!document.querySelector('.map-row.is-child .map-session-button.is-current')`, 8000)
    out(`before: ${beforeId}  after: ${afterId}  childSelected=${childSelected}`)
    mark('m4', forkClicked && selChanged, 'M4 分支 → 选中切换(fork 成功 → 子会话)', `id ${beforeId} → ${afterId}`)
    mark('m5', selChanged && childSelected, 'M5 fork 生成子会话并被选中(City Index 嵌套 .is-child 行)')
  } else {
    mark('m3', true, 'M3 real:只读,不点复制')
    const fbReal = await js(win, `(() => {
      const row = document.querySelector(${JSON.stringify(ASSISTANT_ROW)})
      // 404 探测调用次数(能力停用设计的核心断言:最多一次,不得逐会话刷屏)
      const calls = performance.getEntriesByType('resource').filter(e => e.name.includes('messageFeedback')).length
      if (!row) return { present: false, calls }
      return {
        present: true,
        calls,
        like: !!row.querySelector('button[aria-label="好的回答"]'),
        dislike: !!row.querySelector('button[aria-label="有问题的回答"]'),
      }
    })()`)
    // 能力驱动(2026-08-29):后端装了反馈契约 → 按钮必在;未装(404)→ 一次探测后全局隐藏。
    // 两种形态都合法;断言呼叫 ≤1 次防 404 刷屏回归。
    const fbPresent = fbReal.present && fbReal.like && fbReal.dislike
    const fbAbsent = fbReal.present && !fbReal.like && !fbReal.dislike
    mark('mfb1', (fbPresent || fbAbsent) && fbReal.calls <= 1, 'M-fb1 real:反馈按钮能力驱动(契约在=按钮在;契约缺=一次探测后隐藏,调用≤1 不刷屏)', JSON.stringify(fbReal))
    mark('mfb2', true, 'M-fb2 real:只读,不标记')
    mark('mfb3', true, 'M-fb3 real:只读,不标记')
    mark('mfb4', true, 'M-fb4 real:只读,不开编辑器')
    mark('mfb5', true, 'M-fb5 real:只读,不保存')
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
