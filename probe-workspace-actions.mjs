// P2 工作区/会话行操作探针 — 视图选项菜单(分组/排序)、会话行 … 菜单
// (重命名/分叉会话/归档会话)。fixture 走全流程(fork 后子会话行出现并被选中、
// archive 后行实时消失);真后端只读验证入口(不重命名/分叉/归档真实会话)。用法:
//   npx electron probe-workspace-actions.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-workspace-actions.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-workspace-actions-out')
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
  const clickByText = (sel, text) => `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})]
    const el = els.find(b => (b.innerText ?? '').includes(${JSON.stringify(text)}))
    if (el) { el.click(); return true }
    return false
  })()`

  out(`mode: ${tag}`)

  // ---- W1: 视图选项菜单 ----
  const viewBtn = await waitFor(win, `!!document.querySelector('.sidebar-view-options')`, 8000)
  const viewOpened = await js(win, `(() => { const b = document.querySelector('.sidebar-view-options'); if (!b) return false; b.click(); return true })()`)
  const viewItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
  const viewTexts = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.innerText.trim())`)
  out(`view options items: ${JSON.stringify(viewTexts)}`)
  mark('w1', viewBtn && viewOpened && viewItems &&
    ['按工作区', '单列表', '手动排序', '最近更新'].every(x => viewTexts.includes(x)),
    'W1 视图选项菜单(分组/排序两轴)', JSON.stringify(viewTexts))

  // 切「按工作区」→ 打开 City Index → BAY 章标题出现;切回「单列表」→ 章标题消失
  const groupPicked = await js(win, clickByText('[role="menuitem"]', '按工作区'))
  const mapOpened = await js(win, `(() => { const b = document.querySelector('.map-toggle'); if (!b) return false; b.click(); return true })()`)
  const groupShown = await waitFor(win, `document.querySelectorAll('.map-district-head').length >= 1`, 6000)
  const groupTitles = await js(win, `[...document.querySelectorAll('.map-district-head')].map(x => x.textContent.trim())`)
  mark('w2', groupPicked && mapOpened && groupShown, 'W2 按工作区分组渲染 BAY 章标题(City Index)', JSON.stringify(groupTitles))
  const flatPicked = await js(win, `(() => {
    const b = document.querySelector('.sidebar-view-options'); if (!b) return false
    b.click(); return true
  })()`)
  const flatItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
  const flatClicked = await js(win, clickByText('[role="menuitem"]', '单列表'))
  const groupsGone = await waitFor(win, `document.querySelectorAll('.map-district-head').length === 0`, 6000)
  mark('w3', flatPicked && flatItems && flatClicked && groupsGone, 'W3 切回单列表 → 章标题消失')

  // ---- W2/W4: 会话行 … 菜单(City Index 行内) ----
  const menuBtn = await waitFor(win, `!!document.querySelector('.map-row-menu')`, 6000)
  const menuOpened = await js(win, `(() => { const b = document.querySelector('.map-row-menu'); if (!b) return false; b.click(); return true })()`)
  const menuItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
  const menuTexts = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.innerText.trim())`)
  out(`row menu items: ${JSON.stringify(menuTexts)}`)
  mark('w4', menuBtn && menuOpened && menuItems &&
    ['重命名', '分叉会话', '归档会话'].every(x => menuTexts.includes(x)),
    'W4 会话行 … 菜单(重命名/分叉会话/归档会话)', JSON.stringify(menuTexts))

  if (tag === 'fixture') {
    // W5: 重命名 → Modal → 保存 → 行标题变化
    const renamed = await js(win, clickByText('[role="menuitem"]', '重命名'))
    const modalShown = await waitFor(win, `!!document.querySelector('[role="dialog"][aria-label="重命名会话"]')`, 6000)
    const typed = await js(win, `(() => {
      const d = document.querySelector('[role="dialog"][aria-label="重命名会话"]')
      const input = d?.querySelector('input')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'zion-probe-renamed')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    await sleep(300)
    const saved = await js(win, clickByText('[role="dialog"][aria-label="重命名会话"] button', '保存'))
    const rowRenamed = await waitFor(win, `[...document.querySelectorAll('.sidebar-row-title')].some(t => (t.textContent ?? '').includes('zion-probe-renamed'))`, 8000)
    mark('w5', renamed && modalShown && typed && saved && rowRenamed, 'W5 重命名 Modal → 保存 → 行标题更新')

    // W6: 切回按工作区(子会话嵌套只在分组视图呈现)→ fork → 子行出现且被选中
    await js(win, `(() => { const b = document.querySelector('.sidebar-view-options'); if (b) b.click(); return !!b })()`)
    await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    await js(win, clickByText('[role="menuitem"]', '按工作区'))
    await waitFor(win, `document.querySelectorAll('.map-district-head').length >= 1`, 6000)
    const forkMenuOpen = await js(win, `(() => {
      const rows = [...document.querySelectorAll('.map-row')]
      const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-probe-renamed'))
      const b = target?.querySelector('.map-row-menu')
      if (!b) return false
      b.click(); return true
    })()`)
    const forkItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const forkClicked = await js(win, clickByText('[role="menuitem"]', '分叉会话'))
    const forkSelected = await waitFor(win, `!!document.querySelector('.map-row.is-child .map-session-button.is-current')`, 8000)
    const childRows = await js(win, `document.querySelectorAll('.map-row.is-child').length`)
    const selectedTitle = await js(win, `document.querySelector('.map-row.is-child .map-session-button.is-current .title')?.textContent ?? ''`)
    mark('w6', forkMenuOpen && forkItems && forkClicked && forkSelected, 'W6 分叉会话 → 子会话嵌套行出现且被选中', `childRows=${childRows}, selected=${JSON.stringify(selectedTitle)}`)

    // W7: archive → 城市 Portal 实时消失(归档父行后子代浮为顶层是官方语义,
    // 断言按 data-session-id 消失,不按总行数)
    const parentId = await js(win, `(() => {
      const rows = [...document.querySelectorAll('.map-row:not(.is-child)')]
      const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-probe-renamed'))
      return target?.getAttribute('data-session-id') ?? null
    })()`)
    const archiveMenuOpen = await js(win, `(() => {
      const rows = [...document.querySelectorAll('.map-row:not(.is-child)')]
      const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-probe-renamed'))
      const b = target?.querySelector('.map-row-menu')
      if (!b) return false
      b.click(); return true
    })()`)
    const archiveItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const archiveClicked = await js(win, clickByText('[role="menuitem"]', '归档会话'))
    const rowGone = await waitFor(win, `![...document.querySelectorAll('.sidebar-item')].some(r => r.getAttribute('data-session-id') === ${JSON.stringify(parentId)})`, 8000)
    mark('w7', parentId !== null && archiveMenuOpen && archiveItems && archiveClicked && rowGone, 'W7 归档会话 → 城市 Portal 实时消失(host/session-removed)', `id=${parentId}`)
  } else {
    mark('w5', true, 'W5 真后端只读,不重命名')
    mark('w6', true, 'W6 真后端只读,不分叉')
    mark('w7', true, 'W7 真后端只读,不归档')
  }

  mark('w8', errors.length === 0, 'W8 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `workspace-actions-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `workspace-actions-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `workspace-actions-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== WorkspaceActions 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('WORKSPACE-ACTIONS PROBE FAILED', err); app.exit(1) })
