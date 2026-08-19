// P2 触发菜单探针 — `/` MenuView(命令/技能候选)+ popupSelect(/permission)。
// fixture 走全流程:键入 '/' → 菜单(命令/技能组)→ 过滤 'per' → ArrowDown+Enter
// pick /permission → popupSelect 壳(搜索 + 预设选项)→ 选 Workspace Write →
// 命令执行 + 令牌移除;再验普通命令(/goal → '/goal ')与技能(/fixture-demo)。
// 真后端只读:键入 '/' 菜单出现(真实命令),零错误,不 pick。用法:
//   npx electron probe-trigger.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-trigger.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-trigger-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
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

fs.mkdirSync(OUT, { recursive: true })
const tag = URL.includes('fixture') ? 'fixture' : 'real'

// zion composer 接管前置(P3-⑦):fx-alpha 常驻 approval+question 会接管
// composer(ApprovalPanel → QuestionComposer);先用 resolved 帧结算,直到
// InputBar 回归。real 无挂起交互则直通。
const settleTakeover = async (win) => {
  const pushFrame = (frame) => js(win, `window.__zionProbePushMuxFrame(${JSON.stringify(frame)})`)
  const has = (sel) => js(win, `!!document.querySelector(${JSON.stringify(sel)})`)
  try {
    await waitFor(win, `!!document.querySelector('[data-approval-key]') || !!document.querySelector('.input-bar-textarea')`, 8000)
  } catch { /* 面板未出现也继续(real 无挂起) */ }
  if (await has('[data-approval-key]')) {
    await pushFrame({ type: 'approval/resolved', sessionId: 'fx-alpha', approvalId: 'fx-approval-1' })
    await waitFor(win, `!!document.querySelector('[data-question-key]')`, 8000)
    await pushFrame({ type: 'question/resolved', sessionId: 'fx-alpha', questionRpcId: 'fx-rpc-question' })
    await waitFor(win, `!document.querySelector('[data-question-key]')`, 8000)
  }
  await waitFor(win, `!!document.querySelector('.input-bar-textarea')`, 8000)
}

// 原生 setter + input 事件(React 受控输入;handoff §5)。
const SET_TEXT = (text) => `(() => {
  const el = document.querySelector('.input-bar-textarea')
  if (!el) return false
  el.focus()
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(text)})
  el.setSelectionRange(${text.length}, ${text.length})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`
const KEY = (key) => `(() => {
  const el = document.querySelector('.input-bar-textarea')
  if (!el) return false
  el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }))
  el.dispatchEvent(new KeyboardEvent('keyup', { key: ${JSON.stringify(key)}, bubbles: true }))
  return true
})()`

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

  const MENU = '[role="listbox"][aria-label="触发候选建议"]'
  const draftText = () => `document.querySelector('.input-bar-textarea')?.value ?? ''`

  const clicked = await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
  const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)
  mark('t1', clicked && headerShown, 'T1 选中会话')
  await settleTakeover(win)

  if (tag === 'fixture') {
    // ---- T2: 键入 '/' → 菜单出现(命令/技能组) ----
    const typedSlash = await js(win, SET_TEXT('/'))
    const menuShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(MENU)})`, 8000)
    // 候选经网络/目录异步结算:等首批 option 落地再断言。
    const itemsSettled = await waitFor(win, `document.querySelectorAll(${JSON.stringify(MENU)} + ' [role="option"]').length >= 1`, 8000)
    const groupTitles = await js(win, `[...document.querySelectorAll(${JSON.stringify(MENU)} + ' [data-source]')].map(x => x.getAttribute('data-source'))`)
    const itemNames = await js(win, `[...document.querySelectorAll(${JSON.stringify(MENU)} + ' [role="option"]')].map(b => b.innerText.split('\\n')[0])`)
    out(`menu groups: ${JSON.stringify(groupTitles)} items: ${JSON.stringify(itemNames)}`)
    mark('t2', typedSlash && menuShown && itemsSettled && groupTitles.includes('command') && groupTitles.includes('skill')
      && itemNames.includes('goal') && itemNames.includes('permission') && itemNames.includes('fixture-demo'),
      'T2 / 菜单:命令 + 技能组与候选', JSON.stringify(itemNames))

    // ---- T3: 过滤 'per' → 仅 permission 等 ----
    const typedPer = await js(win, SET_TEXT('/per'))
    const filtered = await waitFor(win, `(() => {
      const names = [...document.querySelectorAll(${JSON.stringify(MENU)} + ' [role="option"]')].map(b => b.innerText.split('\\n')[0])
      return names.includes('permission') && names.length <= 2
    })()`, 6000)
    mark('t3', typedPer && filtered, 'T3 查询过滤(per → permission)')

    // ---- T4: ArrowDown+Enter → pick /permission → popupSelect 壳 ----
    await js(win, KEY('ArrowDown'))
    await sleep(200)
    const entered = await js(win, KEY('Enter'))
    const popupShown = await waitFor(win, `!!document.querySelector('input[aria-label="筛选选项"]')`, 6000)
    const popupLabels = await js(win, `(() => {
      const rows = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
      return rows.map(r => (r.innerText ?? '').split('\\n')[0])
    })()`)
    out(`popup options: ${JSON.stringify(popupLabels)}`)
    mark('t4', entered && popupShown && popupLabels.some(l => l.includes('Workspace Write')) && popupLabels.some(l => l.includes('Full access')),
      'T4 /permission → popupSelect 壳(预设选项)', JSON.stringify(popupLabels))

    // ---- T5: 选 Workspace Write → 命令执行 + 令牌移除 ----
    const picked = await js(win, `(() => {
      const rows = [...document.querySelectorAll('[role="listbox"] [role="option"]')]
      const target = rows.find(r => (r.innerText ?? '').includes('Workspace Write'))
      if (!target) return false
      target.click(); return true
    })()`)
    const popupGone = await waitFor(win, `!document.querySelector('input[aria-label="筛选选项"]')`, 6000)
    const draftAfter = await js(win, draftText())
    mark('t5', picked && popupGone && draftAfter === '', 'T5 选预设 → 命令执行 + 令牌移除', JSON.stringify(draftAfter))

    // ---- T6: 普通命令 pick 落文本 ----
    await js(win, SET_TEXT('/goal'))
    await waitFor(win, `!!document.querySelector(${JSON.stringify(MENU)})`, 6000)
    await js(win, KEY('ArrowDown'))
    await sleep(200)
    await js(win, KEY('Enter'))
    await sleep(400)
    const draftGoal = await js(win, draftText())
    mark('t6', draftGoal === '/goal ', 'T6 命令 pick → 文本 /goal ', JSON.stringify(draftGoal))

    // ---- T7: 技能 pick 落文本(默认高亮 = 首个非空组的首项 fixture-demo) ----
    await js(win, SET_TEXT('/fixture'))
    await waitFor(win, `!!document.querySelector(${JSON.stringify(MENU)})`, 6000)
    await sleep(300)
    await js(win, KEY('Enter'))
    await sleep(400)
    const draftSkill = await js(win, draftText())
    mark('t7', draftSkill === '/fixture-demo ', 'T7 技能 pick → 文本 /fixture-demo ', JSON.stringify(draftSkill))

    // ---- T8: Escape 关菜单 ----
    await js(win, SET_TEXT('/'))
    await waitFor(win, `!!document.querySelector(${JSON.stringify(MENU)})`, 6000)
    await js(win, KEY('Escape'))
    const menuGone = await waitFor(win, `!document.querySelector(${JSON.stringify(MENU)})`, 6000)
    mark('t8', menuGone, 'T8 Escape 关闭菜单')
  } else {
    // ---- real:只读 ----
    const typedSlash = await js(win, SET_TEXT('/'))
    const menuShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(MENU)})`, 8000)
    const itemsSettled = await waitFor(win, `document.querySelectorAll(${JSON.stringify(MENU)} + ' [role="option"]').length >= 1`, 8000)
    const itemNames = await js(win, `[...document.querySelectorAll(${JSON.stringify(MENU)} + ' [role="option"]')].map(b => b.innerText.split('\\n')[0])`)
    out(`real menu items: ${JSON.stringify(itemNames)}`)
    mark('t2', typedSlash && menuShown && itemsSettled && itemNames.length >= 1, 'T2 real:/ 菜单出现(真实命令)', JSON.stringify(itemNames.slice(0, 8)))
    for (const id of ['t3', 't4', 't5', 't6', 't7', 't8']) mark(id, true, `${id} real 只读,不 pick`)
  }

  mark('t9', errors.length === 0, 'T9 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `trigger-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `trigger-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `trigger-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 触发菜单探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('TRIGGER PROBE FAILED', err); app.exit(1) })
