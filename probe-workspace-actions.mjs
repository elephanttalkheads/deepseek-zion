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

  // 切「按工作区」→ 分组头出现;切回「单列表」
  const groupPicked = await js(win, clickByText('[role="menuitem"]', '按工作区'))
  const groupShown = await waitFor(win, `document.querySelectorAll('.sidebar-group-header').length >= 1`, 6000)
  const groupTitles = await js(win, `[...document.querySelectorAll('.sidebar-group-header')].map(x => x.innerText.trim())`)
  mark('w2', groupPicked && groupShown, 'W2 按工作区分组渲染组头', JSON.stringify(groupTitles))
  const flatPicked = await js(win, `(() => {
    const b = document.querySelector('.sidebar-view-options'); if (!b) return false
    b.click(); return true
  })()`)
  const flatItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
  const flatClicked = await js(win, clickByText('[role="menuitem"]', '单列表'))
  const groupsGone = await waitFor(win, `document.querySelectorAll('.sidebar-group-header').length === 0`, 6000)
  mark('w3', flatPicked && flatItems && flatClicked && groupsGone, 'W3 切回单列表 → 分组头消失')

  // ---- W2/W4: 会话行 … 菜单 ----
  const rowCount0 = await js(win, `document.querySelectorAll('.sidebar-item').length`)
  const menuBtn = await waitFor(win, `!!document.querySelector('.sidebar-row-menu')`, 6000)
  const menuOpened = await js(win, `(() => { const b = document.querySelector('.sidebar-row-menu'); if (!b) return false; b.click(); return true })()`)
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
    const rowRenamed = await waitFor(win, `[...document.querySelectorAll('.sidebar-row-title')].some(t => (t.innerText ?? '').includes('zion-probe-renamed'))`, 8000)
    mark('w5', renamed && modalShown && typed && saved && rowRenamed, 'W5 重命名 Modal → 保存 → 行标题更新')

    // W6: fork → 子会话行出现且被选中
    const forkMenuOpen = await js(win, `(() => {
      const rows = [...document.querySelectorAll('.sidebar-item')]
      const target = rows.find(r => (r.querySelector('.sidebar-row-title')?.innerText ?? '').includes('zion-probe-renamed'))
      const b = target?.querySelector('.sidebar-row-menu')
      if (!b) return false
      b.click(); return true
    })()`)
    const forkItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const forkClicked = await js(win, clickByText('[role="menuitem"]', '分叉会话'))
    const forkSelected = await waitFor(win, `!!document.querySelector('.sidebar-item[data-selected]')`, 8000)
    const rowCount1 = await js(win, `document.querySelectorAll('.sidebar-item').length`)
    const selectedTitle = await js(win, `document.querySelector('.sidebar-item[data-selected] .sidebar-row-title')?.innerText ?? ''`)
    mark('w6', forkMenuOpen && forkItems && forkClicked && forkSelected, 'W6 分叉会话 → 子会话行出现且被选中', `rows ${rowCount0}→${rowCount1}, selected=${JSON.stringify(selectedTitle)}`)

    // W7: archive → 行实时消失(fork 子行沿用父标题,按行数递减断言)
    const rowsBeforeArchive = await js(win, `document.querySelectorAll('.sidebar-item').length`)
    const archiveMenuOpen = await js(win, `(() => {
      const rows = [...document.querySelectorAll('.sidebar-item')]
      const target = rows.find(r => (r.querySelector('.sidebar-row-title')?.innerText ?? '').includes('zion-probe-renamed'))
      const b = target?.querySelector('.sidebar-row-menu')
      if (!b) return false
      b.click(); return true
    })()`)
    const archiveItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const archiveClicked = await js(win, clickByText('[role="menuitem"]', '归档会话'))
    const rowGone = await waitFor(win, `document.querySelectorAll('.sidebar-item').length === ${rowsBeforeArchive - 1}`, 8000)
    mark('w7', archiveMenuOpen && archiveItems && archiveClicked && rowGone, 'W7 归档会话 → 行实时消失(host/session-removed)', `rows ${rowsBeforeArchive}→${rowsBeforeArchive - 1}`)
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
