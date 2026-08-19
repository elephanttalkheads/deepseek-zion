// probe-preset.mjs — Agent 预设四表面探针(ui-agent-preset)。P3-⑧ 收尾。
//
// fixture 腿:无会话 hero 的预设 chip(标准模式/极简模式/my-agent 菜单 →
// 选极简模式暂存)→ 新建会话 → 暂存自动应用(agentPresets.select)→ 会话头
// 只读标签出现;设置·通用区默认预设行(选 my-agent → settings.update 往返);
// 设置「Agent 预设」分区:内置/自定义卡片组、复制对话框(id 校验 + 创建 →
// 自定义组新卡)、只读查看器(内置组合正文)、删除确认(自定义卡消失)、卡片设
// 默认(当前使用徽标迁移)。
// real 腿:只读形状(hero chip/设置行/分区存在性 + 零错误;不做变更)。
//
// Usage: npx electron probe-preset.mjs            (fixture)
//        ZION_TAG=real npx electron probe-preset.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-preset-out')
const TAG = process.env.ZION_TAG ?? 'fixture'
const URL = TAG === 'real' ? (process.env.ZION_URL ?? 'http://localhost:5199/') : 'http://localhost:5199/?fixture'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { if (await js(win, expr)) return true } catch { /* 表达式瞬态错误忽略 */ }
    await sleep(150)
  }
  return false
}
const q = (sel) => JSON.stringify(sel)
const menuItem = (label) => `[...document.querySelectorAll('[role="menuitem"]')].find(b => (b.innerText ?? '').includes(${JSON.stringify(label)}))`
const clickMenuItem = (label) => `(() => { const b = ${menuItem(label)}; if (!b) return false; b.click(); return true })()`
const setInput = (sel, value) => `(() => {
  const el = document.querySelector(${q(sel)})
  if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`
// 设置壳内某张预设卡(按卡名),卡 = li;脚部动作按钮为图标钮,按 aria-label 匹配。
const card = (name) => `[...document.querySelectorAll('.settings-content li')].find(li => (li.innerText ?? '').includes(${JSON.stringify(name)}))`
const clickCardButton = (name, label) => `(() => { const li = ${card(name)}; const b = li ? [...li.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') ?? '').includes(${JSON.stringify(label)})) : undefined; if (!b) return false; b.click(); return true })()`

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
  const heroChip = `.conversation-hero button[aria-haspopup="menu"]`

  if (TAG === 'real') {
    // ---- real:只读形状 ----
    const chip = await js(win, `!!document.querySelector(${q(heroChip)})`)
    out(`hero preset chip: ${chip}`)
    if (chip) {
      await js(win, `document.querySelector(${q(heroChip)})?.click()`)
      const items = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
      const names = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => (b.innerText ?? '').split('\\n')[0])`)
      out(`hero menu items: ${JSON.stringify(names)}`)
      mark('p1', items && names.length >= 1, 'P1 real:hero 预设 chip 菜单(真实 roster)', JSON.stringify(names.slice(0, 6)))
      await js(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    } else {
      mark('p1', true, 'P1 real:hero 无预设 chip(后端未配置 → 官方同款隐藏)')
    }
    const openedSettings = await js(win, `(() => { const b = document.querySelector('.sidebar-settings-trigger'); if (!b) return false; b.click(); return true })()`)
    await waitFor(win, `!!document.querySelector('.settings-shell')`, 8000)
    const nav = await js(win, `(() => { const b = [...document.querySelectorAll('.settings-nav-item')].find(x => x.innerText.includes('Agent')); if (!b) return false; b.click(); return true })()`)
    const sectionShown = await waitFor(win, `document.body.innerText.includes('预设即一个会话')`, 8000)
    mark('p2', openedSettings && nav && sectionShown, 'P2 real:设置「Agent 预设」分区渲染(sectionIntro)')
    const generalRow = await js(win, `(() => { const b = [...document.querySelectorAll('.settings-nav-item')].find(x => x.innerText.includes('通用')); if (!b) return false; b.click(); return true })()`)
    const rowShown = await waitFor(win, `[...document.querySelectorAll('.settings-shell div')].some(d => d.children.length === 0 && d.innerText.trim() === 'Agent 预设')`, 8000)
    mark('p3', generalRow && rowShown, 'P3 real:设置·通用区默认预设行')
    for (const id of ['p4', 'p5', 'p6', 'p7', 'p8', 'p9']) mark(id, true, `${id} real 只读`)
  } else {
    // ---- P1: hero 预设 chip + 菜单(内置/自定义 roster) ----
    const chipShown = await waitFor(win, `!!document.querySelector(${q(heroChip)})`, 8000)
    const opened = await js(win, `(() => { const b = document.querySelector(${q(heroChip)}); if (!b) return false; b.click(); return true })()`)
    const items = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const names = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => (b.innerText ?? '').split('\\n')[0])`)
    mark('p1', chipShown && opened && items && names.includes('标准模式') && names.includes('极简模式') && names.includes('my-agent'),
      'P1 hero 预设 chip 菜单(标准/极简/my-agent)', JSON.stringify(names))

    // ---- P2: 选极简模式 → chip 暂存 ----
    const picked = await js(win, clickMenuItem('极简模式'))
    const chipLabel = await waitFor(win, `(document.querySelector(${q(heroChip)})?.innerText ?? '').includes('极简模式')`, 6000)
    mark('p2', picked && chipLabel, 'P2 选极简模式 → chip 暂存显示')

    // ---- P3: 新建会话 → 暂存自动应用 → 会话头只读标签 ----
    const created = await js(win, `(() => { const b = document.querySelector('.shell-new'); if (!b) return false; b.click(); return true })()`)
    const labelShown = await waitFor(win, `(document.querySelector('.conversation-header-actions')?.innerText ?? '').includes('极简模式')`, 10000)
    mark('p3', created && labelShown, 'P3 新建会话 → 暂存应用 → 会话头标签', await js(win, `document.querySelector('.conversation-header-actions')?.innerText ?? ''`))

    // ---- P4: 设置·通用区默认预设行(选 my-agent → settings.update 往返) ----
    const openedSettings = await js(win, `(() => { const b = document.querySelector('.sidebar-settings-trigger'); if (!b) return false; b.click(); return true })()`)
    const rowTitle = await waitFor(win, `[...document.querySelectorAll('.settings-shell div')].some(d => d.children.length === 0 && d.innerText.trim() === 'Agent 预设')`, 8000)
    const rowBtn = await js(win, `(() => {
      const title = [...document.querySelectorAll('.settings-shell div')].find(d => d.children.length === 0 && d.innerText.trim() === 'Agent 预设')
      const row = title?.parentElement?.parentElement
      const b = row?.querySelector('button[aria-haspopup="menu"]')
      if (!b) return false
      b.click(); return true
    })()`)
    const rowItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const pickedRow = await js(win, clickMenuItem('my-agent'))
    const rowLabel = await waitFor(win, `(() => {
      const title = [...document.querySelectorAll('.settings-shell div')].find(d => d.children.length === 0 && d.innerText.trim() === 'Agent 预设')
      const row = title?.parentElement?.parentElement
      return (row?.querySelector('button[aria-haspopup="menu"]')?.innerText ?? '').includes('my-agent')
    })()`, 8000)
    mark('p4', openedSettings && rowTitle && rowBtn && rowItems && pickedRow && rowLabel, 'P4 通用区默认预设行:选 my-agent → settings.update 往返')

    // ---- P5: Agent 预设分区(内置/自定义组 + 当前使用) ----
    const navPreset = await js(win, `(() => { const b = [...document.querySelectorAll('.settings-nav-item')].find(x => x.innerText.includes('Agent')); if (!b) return false; b.click(); return true })()`)
    const sectionShown = await waitFor(win, `document.body.innerText.includes('内置') && document.body.innerText.includes('自定义') && document.body.innerText.includes('预设即一个会话')`, 8000)
    const myAgentInUse = await js(win, `(() => { const li = ${card('my-agent')}; return !!li && (li.innerText ?? '').includes('当前使用') })()`)
    mark('p5', navPreset && sectionShown && myAgentInUse, 'P5 分区:内置/自定义组 + my-agent 当前使用')

    // ---- P6: 复制极简模式 → 复制对话框(id 校验 + 创建 → 自定义组新卡) ----
    const copyClicked = await js(win, clickCardButton('极简模式', '复制'))
    const dialogShown = await waitFor(win, `document.body.innerText.includes('复制预设') && document.body.innerText.includes('复制自 极简模式')`, 6000)
    const invalidBlocked = await js(win, `(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(x => (x.innerText ?? '').includes('复制预设'))
      if (!d) return null
      const input = d.querySelector('input[placeholder="my-agent"]')
      if (!input) return null
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Bad ID'); input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    await sleep(200)
    const invalidMsg = await waitFor(win, `document.body.innerText.includes('只能使用小写字母、数字与连字符')`, 6000)
    const fixed = await js(win, `(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(x => (x.innerText ?? '').includes('复制预设'))
      const input = d?.querySelector('input[placeholder="my-agent"]')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'my-copy'); input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    const createClicked = await waitFor(win, `(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(x => (x.innerText ?? '').includes('复制预设'))
      const b = d ? [...d.querySelectorAll('button')].find(x => (x.innerText ?? '').trim() === '创建' && !x.disabled) : undefined
      if (!b) return false
      b.click(); return true
    })()`, 6000)
    const copyCard = await waitFor(win, `(() => { const li = ${card('my-copy')}; return !!li && (li.innerText ?? '').includes('自定义') })()`, 8000)
    mark('p6', copyClicked && dialogShown && invalidBlocked && invalidMsg && fixed && createClicked && copyCard, 'P6 复制对话框:id 校验 → 创建 → 自定义组新卡 my-copy')

    // ---- P7: 只读查看器(内置组合正文) ----
    const viewClicked = await js(win, clickCardButton('标准模式', '查看'))
    const viewerShown = await waitFor(win, `[...document.querySelectorAll('[role="dialog"]')].some(d => (d.innerText ?? '').includes('tool-bash'))`, 6000)
    const viewerClosed = await js(win, `(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(x => (x.innerText ?? '').includes('tool-bash'))
      const b = d ? [...d.querySelectorAll('button')].find(x => (x.innerText ?? '').includes('关闭')) : undefined
      if (!b) return false
      b.click(); return true
    })()`)
    const viewerGone = await waitFor(win, `![...document.querySelectorAll('[role="dialog"]')].some(d => (d.innerText ?? '').includes('tool-bash'))`, 6000)
    mark('p7', viewClicked && viewerShown && viewerClosed && viewerGone, 'P7 只读查看器(标准模式组合正文)+ 关闭')

    // ---- P8: 删除 my-copy(确认 → 卡消失) ----
    const delClicked = await js(win, clickCardButton('my-copy', '删除'))
    const confirmShown = await waitFor(win, `document.body.innerText.includes('删除该预设？')`, 6000)
    const confirmed = await js(win, `(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find(x => (x.innerText ?? '').includes('删除该预设？'))
      const b = d ? [...d.querySelectorAll('button')].find(x => (x.innerText ?? '').trim() === '删除' && !x.disabled) : undefined
      if (!b) return false
      b.click(); return true
    })()`)
    const cardGone = await waitFor(win, `![...document.querySelectorAll('.settings-content li')].some(li => (li.innerText ?? '').includes('my-copy'))`, 8000)
    mark('p8', delClicked && confirmShown && confirmed && cardGone, 'P8 删除确认 → my-copy 卡消失')

    // ---- P9: 卡片设默认 → 当前使用徽标迁移 ----
    const defaultClicked = await js(win, `(() => { const li = ${card('标准模式')}; const b = li?.querySelector('button'); if (!b) return false; b.click(); return true })()`)
    const inUseMoved = await waitFor(win, `(() => { const li = ${card('标准模式')}; return !!li && (li.innerText ?? '').includes('当前使用') })()`, 8000)
    mark('p9', defaultClicked && inUseMoved, 'P9 点标准模式卡 → 设为默认(当前使用徽标迁移)')

    // ---- P10: 零控制台错误 ----
    mark('p10', errors.length === 0, 'P10 全程零控制台错误', errors.length ? `${errors.length} 个` : '')
  }

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `preset-${TAG}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `preset-${TAG}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `preset-${TAG}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  out(`--- ${pass}/${total} passed (${TAG}) ---`)
  app.exit(pass === total ? 0 : 1)
}).catch(err => { console.error('PRESET PROBE FAILED', err); app.exit(1) })
