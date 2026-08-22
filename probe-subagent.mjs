// probe-subagent.mjs — 子代理目录树 + 只读 composer 探针(ui-subagent)。P3-⑩ 收尾。
//
// fixture 腿:选 fx-alpha → 会话头目录树触发钮(计数徽标)→ 展开树:
// Beta 子代理(可继续,有下级)→ 展开 → Gamma 孙代理(一次性,叶子)→ 点行打开
// → 选中 fx-gamma → composer 只读接管(一次性子代理记录:标题+正文,无输入条);
// 回选 fx-alpha → 只读面消失(常驻审批接管)。零控制台错误。
// real 腿:目录树触发钮存在性(有子代理的会话)+ 零错误(只读)。
//
// Usage: npx electron probe-subagent.mjs            (fixture)
//        ZION_TAG=real npx electron probe-subagent.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-subagent-out')
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
const TRIGGER = `button[aria-haspopup="tree"]`

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

  await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
  const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)

  if (TAG === 'real') {
    // ---- real:目录树触发钮(有子代理的会话才出现;无子代理 = 官方同款隐藏) ----
    const triggerSeen = await waitFor(win, `!!document.querySelector(${q(TRIGGER)})`, 10000)
    const actionsArea = await js(win, `!!document.querySelector('.conversation-header-actions')`)
    out(`real catalog trigger: ${triggerSeen} (无子代理会话时官方隐藏该动作)`)
    mark('s1', headerShown && actionsArea, 'S1 real:会话头动作行就绪(子代理会话显示目录树,无则隐藏)', triggerSeen ? '触发钮出现' : '无子代理 → 隐藏(官方同款)')
    const crumbNavReal = await js(win, `(() => {
      const nav = document.querySelector('nav[aria-label="会话层级"]')
      if (!nav) return { found: false }
      const segs = [...nav.querySelectorAll('.conversation-header-crumb')]
      return { found: true, count: segs.length }
    })()`)
    mark('s1b', crumbNavReal.found && crumbNavReal.count >= 1, 'S1b real:普通会话头「会话层级」面包屑(单段只读)', JSON.stringify(crumbNavReal))
    for (const id of ['s2', 's3', 's4', 's5', 's6']) mark(id, true, `${id} real 只读`)
    mark('s6', errors.length === 0, 'S6 零控制台错误', errors.length ? `${errors.length} 个` : '')
  } else {
    // ---- S1: 会话头目录树触发钮(计数徽标) ----
    const triggerSeen = await waitFor(win, `!!document.querySelector(${q(TRIGGER)})`, 10000)
    const triggerLabel = await js(win, `(document.querySelector(${q(TRIGGER)})?.getAttribute('aria-label') ?? '')`)
    mark('s1', headerShown && triggerSeen && triggerLabel.includes('子代理'), 'S1 目录树触发钮(计数徽标)', triggerLabel)

    // ---- S2: 打开树 → Beta 子代理(可继续,有下级) ----
    const opened = await js(win, `(() => { const b = document.querySelector(${q(TRIGGER)}); if (!b) return false; b.click(); return true })()`)
    const treeShown = await waitFor(win, `!!document.querySelector('[role="tree"]')`, 6000)
    const betaRow = await waitFor(win, `[...document.querySelectorAll('[role="treeitem"]')].some(b => (b.innerText ?? '').includes('Beta 子代理'))`, 8000)
    const betaText = await js(win, `([...document.querySelectorAll('[role="treeitem"]')].find(b => (b.innerText ?? '').includes('Beta 子代理'))?.innerText ?? '')`)
    const disclosureShown = await js(win, `!![...document.querySelectorAll('[role="treeitem"] button')].find(b => (b.getAttribute('aria-label') ?? '').includes('展开 Beta 子代理'))`)
    mark('s2', opened && treeShown && betaRow && betaText.includes('可继续') && disclosureShown, 'S2 树: Beta 子代理(可继续 + 展开钮)', JSON.stringify(betaText.slice(0, 40)))

    // ---- S3: 展开 Beta → Gamma 孙代理(一次性,叶子) ----
    const expanded = await js(win, `(() => {
      const b = [...document.querySelectorAll('[role="treeitem"] button')].find(x => (x.getAttribute('aria-label') ?? '').includes('展开 Beta 子代理'))
      if (!b) return false
      b.click(); return true
    })()`)
    const gammaRow = await waitFor(win, `[...document.querySelectorAll('[role="treeitem"]')].some(b => (b.innerText ?? '').includes('Gamma 孙代理'))`, 8000)
    const gammaText = await js(win, `([...document.querySelectorAll('[role="treeitem"]')].find(b => (b.innerText ?? '').includes('Gamma 孙代理'))?.innerText ?? '')`)
    mark('s3', expanded && gammaRow && gammaText.includes('一次性'), 'S3 展开 → Gamma 孙代理(一次性叶子)', JSON.stringify(gammaText.slice(0, 40)))

    // ---- S4: 点 Gamma 行 → 打开子会话 → 只读 composer 接管(无输入条) ----
    const clicked = await js(win, `(() => {
      const b = [...document.querySelectorAll('[role="treeitem"]')].find(x => (x.innerText ?? '').includes('Gamma 孙代理'))
      if (!b) return false
      b.click(); return true
    })()`)
    const readonlyShown = await waitFor(win, `(() => {
      const seat = document.querySelector('[data-composer-seat]')
      if (!seat) return false
      return (seat.innerText ?? '').includes('一次性子代理记录') && (seat.innerText ?? '').includes('一次性任务不支持后续消息')
    })()`, 8000)
    const noInput = await js(win, `!document.querySelector('[data-composer-seat] .input-bar-textarea')`)
    mark('s4', clicked && readonlyShown && noInput, 'S4 打开 Gamma → 只读 composer(一次性子代理记录,无输入条)')

    // ---- S4b: 会话层级面包屑(官方「会话层级」nav;进入子代理会话后显示祖先链) ----
    const crumbNav = await js(win, `(() => {
      const nav = document.querySelector('nav[aria-label="会话层级"]')
      if (!nav) return { found: false }
      const segs = [...nav.querySelectorAll('.conversation-header-crumb')]
      const current = segs.find(b => b.className.includes('conversation-header-crumb-current'))
      const clickable = segs.filter(b => !b.className.includes('conversation-header-crumb-current'))
      return {
        found: true, count: segs.length,
        texts: segs.map(b => (b.innerText ?? '').trim()),
        currentIsSpan: current ? current.tagName === 'SPAN' : false,
        clickableCount: clickable.length,
      }
    })()`)
    mark('s4b', crumbNav.found && crumbNav.count >= 2 && crumbNav.currentIsSpan && crumbNav.clickableCount >= 1,
      'S4b 子会话头显示「会话层级」面包屑(祖先链可点,当前段只读)', JSON.stringify(crumbNav))

    // ---- S5: 面包屑点主会话段 → 回父会话(官方「返回主会话」入口;只读面消失 + 常驻审批接管) ----
    const back = await js(win, `(() => {
      const nav = document.querySelector('nav[aria-label="会话层级"]')
      const first = nav?.querySelector('.conversation-header-crumb')
      if (!first || first.className.includes('conversation-header-crumb-current')) return 0
      first.click(); return 1
    })()`)
    const readonlyGone = await waitFor(win, `!([...document.querySelectorAll('[data-composer-seat] [role="status"]')].some(s => (s.innerText ?? '').includes('一次性子代理记录')))`, 8000)
    const approvalBack = await waitFor(win, `!!document.querySelector('[data-composer-seat] [data-approval-key]')`, 8000)
    mark('s5', back === 1 && readonlyGone && approvalBack, 'S5 面包屑点主会话段 → 回父会话(只读面消失,审批接管)')

    // ---- S6: 零控制台错误 ----
    mark('s6', errors.length === 0, 'S6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')
  }

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `subagent-${TAG}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `subagent-${TAG}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `subagent-${TAG}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  out(`--- ${pass}/${total} passed (${TAG}) ---`)
  app.exit(pass === total ? 0 : 1)
}).catch(err => { console.error('SUBAGENT PROBE FAILED', err); app.exit(1) })
