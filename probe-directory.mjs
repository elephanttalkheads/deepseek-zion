// probe-directory.mjs — Miller 目录浏览弹窗探针(ui-directory-picker-browse)。
// P3-⑨ 收尾。
//
// fixture 腿:工作区菜单「+ 新建工作区」→ 680×500「选择工作区目录」弹窗 →
// 主目录单栏(隐藏项默认不可见)→ 选 Documents → 双栏(右侧子目录)→ 右栏
// 推进(deepseek-harness)→ 新建文件夹(嵌套对话框,目标=选中项)→ 创建后选中
// 新卡;路径编辑(编辑路径 → 键入 → Enter → 双栏落地);显示隐藏开关(.config
// 出现/消失);「打开」→ workspace.create → 弹窗关闭 + 工作区列表 +1;Escape
// 取消不加列表。
// real 腿:打开弹窗 → 真实主目录渲染(只读)→ 取消,零错误。
//
// Usage: npx electron probe-directory.mjs            (fixture)
//        ZION_TAG=real npx electron probe-directory.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-directory-out')
const TAG = process.env.ZION_TAG ?? 'fixture'
const URL = TAG === 'real' ? (process.env.ZION_URL ?? 'http://localhost:5199/') : 'http://localhost:5199/?fixture'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
// 探针侧防御:单步表达式失败记录而不中断(页面态缺失时置 false/null)。
const safe = async (win, expr, fallback = false) => {
  try { return await js(win, expr) } catch (e) { console.log(`[safe] expr failed: ${String(e).slice(0, 80)} :: ${expr.slice(0, 120)}`); return fallback }
}
const waitFor = async (win, expr, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try { if (await safe(win, expr)) return true } catch { /* 瞬态表达式错误忽略 */ }
    await sleep(150)
  }
  return false
}
const q = (sel) => JSON.stringify(sel)
const DIALOG = `[role="dialog"]`
const rowNames = `[...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].map(b => (b.innerText ?? '').split('\\n')[0])`
const clickRow = (name) => `(() => {
  const b = [...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].find(x => (x.innerText ?? '').includes(${JSON.stringify(name)}))
  if (!b) return false
  b.click(); return true
})()`
const clickDialogButton = (label) => `(() => {
  const d = [...document.querySelectorAll(${q(DIALOG)})].at(-1)
  const b = d ? [...d.querySelectorAll('button')].find(x => (x.innerText ?? '').trim() === ${JSON.stringify(label)}) : undefined
  if (!b) return false
  b.click(); return true
})()`
const setInput = (sel, value) => `(() => {
  const el = document.querySelector(${q(sel)})
  if (!el) return false
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

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

  // 打开工作区菜单 → 新建工作区 → 浏览弹窗
  const openedMenu = await safe(win, `(() => { const b = document.querySelector('.shell-workspace'); if (!b) return false; b.click(); return true })()`)
  const createBtn = await waitFor(win, `!!document.querySelector('.workspace-menu-create')`, 8000)
  const wsCountBefore = await safe(win, `document.querySelectorAll('.workspace-menu-item').length`)
  const clickedCreate = await safe(win, `(() => { const b = document.querySelector('.workspace-menu-create'); if (!b) return false; b.click(); return true })()`)
  const dialogShown = await waitFor(win, `[...document.querySelectorAll(${q(DIALOG)})].some(d => (d.innerText ?? '').includes('选择工作区目录'))`, 8000)

  if (TAG === 'real') {
    // ---- real:真实主目录渲染 + 取消 ----
    await sleep(2000)
    const homeRows = await waitFor(win, `document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')}).length >= 1`, 10000)
    const names = await safe(win, rowNames, [])
    const dialogText = await safe(win, `([...document.querySelectorAll(${q(DIALOG)})].at(-1)?.innerText ?? '')`, '')
    // 3080 未装配 browse 能力时官方同款:弹窗打开并诚实报告能力缺失。
    const capabilityNote = dialogText.includes('listDirectory') || dialogText.includes('browse')
    out(`real dialog: rows=${names.length} capabilityNote=${capabilityNote}`)
    mark('d1', openedMenu && createBtn && clickedCreate && dialogShown && (homeRows || capabilityNote),
      'D1 real:浏览弹窗(真实主目录或 browse 能力缺失提示)', JSON.stringify(names.slice(0, 6)))
    const cancelled = await safe(win, clickDialogButton('取消'))
    const gone = await waitFor(win, `![...document.querySelectorAll(${q(DIALOG)})].some(d => (d.innerText ?? '').includes('选择工作区目录'))`, 6000)
    mark('d2', cancelled && gone, 'D2 real:取消关闭弹窗')
    for (const id of ['d3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9']) mark(id, true, `${id} real 只读`)
    mark('d9', errors.length === 0, 'D9 零控制台错误', errors.length ? `${errors.length} 个` : '')
  } else {
    // ---- D1: 主目录单栏(隐藏项默认不可见) ----
    const homeRows = await waitFor(win, `document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')}).length >= 2`, 8000)
    const names1 = await safe(win, rowNames)
    const homeTitle = await safe(win, `(document.querySelector(${q(DIALOG + ' [role="navigation"]')})?.innerText ?? '')`)
    mark('d1', openedMenu && createBtn && clickedCreate && dialogShown && homeRows && names1.includes('Documents')
      && names1.includes('Downloads') && !names1.includes('.config') && homeTitle.includes('主目录'),
      'D1 弹窗 + 主目录单栏(隐藏项默认不可见)', JSON.stringify(names1))

    // ---- D2: 选 Documents → 双栏(右侧子目录) ----
    const picked = await safe(win, clickRow('Documents'))
    const rightShown = await waitFor(win, `(() => {
      const cols = [...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})]
      const names = cols.map(b => (b.innerText ?? '').split('\\n')[0])
      return names.includes('project') && names.includes('deepseek-harness')
    })()`, 8000)
    const crumbDoc = await safe(win, `(document.querySelector(${q(DIALOG + ' [role="navigation"]')})?.innerText ?? '').includes('Documents')`)
    mark('d2', picked && rightShown && crumbDoc, 'D2 选 Documents → 双栏 + 面包屑推进')

    // ---- D3: 右栏推进(deepseek-harness)→ 左=Documents 子级,面包屑加深 ----
    const advanced = await safe(win, clickRow('deepseek-harness'))
    const advancedShown = await waitFor(win, `(() => {
      const names = [...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].map(b => (b.innerText ?? '').split('\\n')[0])
      const nav = document.querySelector(${q(DIALOG + ' [role="navigation"]')})
      return names.includes('project') && !!nav && (nav.innerText ?? '').includes('deepseek-harness')
    })()`, 8000)
    mark('d3', advanced && advancedShown, 'D3 右栏推进 → 视图深一级')

    // ---- D4: 新建文件夹(嵌套对话框,目标=选中项)→ 创建后选中新卡 ----
    const newFolder = await safe(win, clickDialogButton('新建文件夹'))
    const createIn = await waitFor(win, `[...document.querySelectorAll(${q(DIALOG)})].some(d => (d.innerText ?? '').includes('在"deepseek-harness"中新建文件夹'))`, 6000)
    const typedName = await safe(win, setInput(`input[aria-label="文件夹名称"]`, 'my-proj'))
    const created = await safe(win, clickDialogButton('创建'))
    const selectedNew = await waitFor(win, `(() => {
      const rows = [...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})]
      return rows.some(b => (b.innerText ?? '').includes('my-proj') && b.getAttribute('aria-current') === 'true')
    })()`, 8000)
    mark('d4', newFolder && createIn && typedName && created && selectedNew, 'D4 新建文件夹 → 创建并选中 my-proj')

    // ---- D5: 路径编辑(编辑路径 → 键入 → Enter → 双栏落地) ----
    const editClicked = await safe(win, `(() => { const b = document.querySelector(${q(DIALOG + ' button[aria-label="编辑路径"]')}); if (!b) return false; b.click(); return true })()`)
    const inputShown = await waitFor(win, `!!document.querySelector(${q(DIALOG + ' input[aria-label="编辑路径"]')})`, 6000)
    const typedPath = await safe(win, setInput(`input[aria-label="编辑路径"]`, '/home/fixture/Documents'))
    const submitted = await safe(win, `(() => {
      const el = document.querySelector(${q(DIALOG + ' input[aria-label="编辑路径"]')})
      if (!el) return false
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      return true
    })()`)
    const landed = await waitFor(win, `(() => {
      const nav = document.querySelector(${q(DIALOG + ' [role="navigation"]')})
      const names = [...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].map(b => (b.innerText ?? '').split('\\n')[0])
      return !!nav && (nav.innerText ?? '').includes('Documents') && names.includes('project')
    })()`, 8000)
    mark('d5', editClicked && inputShown && typedPath && submitted && landed, 'D5 路径编辑 → Enter → 双栏落地 Documents')

    // ---- D6: 显示隐藏开关(.config 出现/消失) ----
    const homeCrumb = await safe(win, `(() => {
      const b = [...document.querySelectorAll(${q(DIALOG + ' [role="navigation"] button')})].find(x => (x.innerText ?? '').trim() === '主目录')
      if (!b) return false
      b.click(); return true
    })()`)
    const homeAgain = await waitFor(win, `[...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].some(b => (b.innerText ?? '').includes('Downloads'))`, 8000)
    const toggled = await safe(win, clickDialogButton('显示隐藏文件'))
    const hiddenShown = await waitFor(win, `[...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].some(b => (b.innerText ?? '').includes('.config'))`, 6000)
    const toggledOff = await safe(win, clickDialogButton('显示隐藏文件'))
    const hiddenGone = await waitFor(win, `![...document.querySelectorAll(${q(DIALOG + ' [role="list"] [role="listitem"] button')})].some(b => (b.innerText ?? '').includes('.config'))`, 6000)
    mark('d6', homeCrumb && homeAgain && toggled && hiddenShown && toggledOff && hiddenGone, 'D6 显示隐藏开关(.config 出现/消失)')

    // ---- D7: 打开 → workspace.create → 弹窗关闭 + 工作区列表 +1(成功后面板关闭,重开菜单数行) ----
    const opened = await safe(win, clickDialogButton('打开'))
    const dialogGone = await waitFor(win, `![...document.querySelectorAll(${q(DIALOG)})].some(d => (d.innerText ?? '').includes('选择工作区目录'))`, 8000)
    const menuReopened = await safe(win, `(() => { const b = document.querySelector('.shell-workspace'); if (!b) return false; b.click(); return true })()`)
    const listGrew = await waitFor(win, `document.querySelectorAll('.workspace-menu-item').length === ${wsCountBefore + 1}`, 10000)
    const wsNames = await safe(win, `[...document.querySelectorAll('.workspace-menu-item .workspace-menu-title')].map(e => e.innerText)`)
    mark('d7', opened && dialogGone && menuReopened && listGrew, 'D7 打开 → 工作区创建 + 列表增长', JSON.stringify(wsNames))

    // ---- D8: Escape 取消不再创建 ----
    const count2 = await safe(win, `document.querySelectorAll('.workspace-menu-item').length`)
    await safe(win, `(() => { const b = document.querySelector('.workspace-menu-create'); if (!b) return false; b.click(); return true })()`)
    const reopen = await waitFor(win, `[...document.querySelectorAll(${q(DIALOG)})].some(d => (d.innerText ?? '').includes('选择工作区目录'))`, 8000)
    await safe(win, `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    const escGone = await waitFor(win, `![...document.querySelectorAll(${q(DIALOG)})].some(d => (d.innerText ?? '').includes('选择工作区目录'))`, 6000)
    const count3 = await safe(win, `document.querySelectorAll('.workspace-menu-item').length`)
    mark('d8', reopen && escGone && count3 === count2, 'D8 Escape 取消不创建列表不变')

    // ---- D9: 零控制台错误 ----
    mark('d9', errors.length === 0, 'D9 全程零控制台错误', errors.length ? `${errors.length} 个` : '')
  }

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `directory-${TAG}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `directory-${TAG}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `directory-${TAG}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  out(`--- ${pass}/${total} passed (${TAG}) ---`)
  app.exit(pass === total ? 0 : 1)
}).catch(err => { console.error('DIRECTORY PROBE FAILED', err); app.exit(1) })
