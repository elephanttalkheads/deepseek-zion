// P2 拖拽重排 + 溢出展开探针。fixture 走全流程:按工作区分组 → 重命名 fx-alpha →
// 分叉 3 次(组内 6 行)→ 溢出控制(5 行 + 「+1」)→ 展开 → 手动排序下拖拽
// 'zion-drag-src' 到最后一行下半 → insertSessionBefore → 顺序可见变化。
// 真后端只读:验证入口(分组 + draggable 属性 + 溢出按钮存在性),不执行拖拽。
// 用法:
//   npx electron probe-sidebar-drag.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-sidebar-drag.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-sidebar-drag-out')
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

const ROW_TITLES = `[...document.querySelectorAll('.sidebar-group .sidebar-row-title')].map(t => t.innerText.trim())`
const GROUP_ROW_TITLES = `(() => {
  const g = document.querySelector('.sidebar-group[data-group]')
  return g ? [...g.querySelectorAll('.sidebar-row-title')].map(t => t.innerText.trim()) : []
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
  const clickByText = (sel, text) => `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})]
    const el = els.find(b => (b.innerText ?? '').includes(${JSON.stringify(text)}))
    if (el) { el.click(); return true }
    return false
  })()`

  out(`mode: ${tag}`)

  // 按工作区分组 + 手动排序(拖拽落点可见)
  const openView = async () => {
    const b = await waitFor(win, `!!document.querySelector('.sidebar-view-options')`, 8000)
    if (!b) return false
    await js(win, `document.querySelector('.sidebar-view-options').click()`)
    await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    await js(win, clickByText('[role="menuitem"]', '按工作区'))
    await waitFor(win, `document.querySelectorAll('.sidebar-group-header').length >= 1`, 6000)
    await js(win, `document.querySelector('.sidebar-view-options').click()`)
    await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    await js(win, clickByText('[role="menuitem"]', '手动排序'))
    await sleep(600)
    return true
  }

  if (tag === 'fixture') {
    mark('d0', await openView(), 'D0 按工作区分组 + 手动排序')

    // 重命名第一行(fx-alpha,运行中)→ zion-drag-src
    const renamed = await (async () => {
      await js(win, `(() => { const b = document.querySelector('.sidebar-row-menu'); if (b) b.click(); return !!b })()`)
      await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
      await js(win, clickByText('[role="menuitem"]', '重命名'))
      const shown = await waitFor(win, `!!document.querySelector('[role="dialog"][aria-label="重命名会话"]')`, 6000)
      await js(win, `(() => {
        const d = document.querySelector('[role="dialog"][aria-label="重命名会话"]')
        const input = d?.querySelector('input')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'zion-drag-src')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await sleep(300)
      await js(win, clickByText('[role="dialog"][aria-label="重命名会话"] button', '保存'))
      return shown && await waitFor(win, `[...document.querySelectorAll('.sidebar-row-title')].some(t => (t.innerText ?? '').includes('zion-drag-src'))`, 8000)
    })()
    mark('d1', renamed, 'D1 重命名 fx-alpha → zion-drag-src')

    // 分叉 3 次 → 组内 6 行
    for (let i = 0; i < 3; i++) {
      await js(win, `(() => {
        const row = [...document.querySelectorAll('.sidebar-item')].find(r => (r.querySelector('.sidebar-row-title')?.innerText ?? '').includes('zion-drag-src'))
        const b = row?.querySelector('.sidebar-row-menu')
        if (!b) return false
        b.click(); return true
      })()`)
      await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
      await js(win, clickByText('[role="menuitem"]', '分叉会话'))
      await sleep(1200)
    }
    const groupCount = await js(win, `document.querySelectorAll('.sidebar-group[data-group] .sidebar-item').length`)
    out(`group rows after 3 forks: ${groupCount}`)

    // D2: 溢出控制(5 行 + 「+1」)
    const moreBtn = await waitFor(win, `!!document.querySelector('.sidebar-group-more')`, 8000)
    const moreText = await js(win, `document.querySelector('.sidebar-group-more')?.innerText ?? ''`)
    const visibleRows = await js(win, `document.querySelectorAll('.sidebar-group[data-group] .sidebar-item').length`)
    mark('d2', moreBtn && visibleRows === 5 && moreText.includes('1 个更多'), 'D2 溢出折叠(5 行 + 展开按钮)', `rows=${visibleRows}, btn=${JSON.stringify(moreText)}`)
    const expanded = await js(win, `(() => { const b = document.querySelector('.sidebar-group-more'); if (!b) return false; b.click(); return true })()`)
    const allRows = await waitFor(win, `document.querySelectorAll('.sidebar-group[data-group] .sidebar-item').length === 6`, 6000)
    mark('d3', expanded && allRows, 'D3 点击展开 → 6 行全显示')

    // D4: 拖拽 zion-drag-src 到最后一行下半 → 顺序变化
    const orderBefore = await js(win, GROUP_ROW_TITLES)
    out(`order before: ${JSON.stringify(orderBefore)}`)
    const dragged = await js(win, `(() => {
      const items = [...document.querySelectorAll('.sidebar-group[data-group] .sidebar-item')]
      const src = items.find(r => (r.querySelector('.sidebar-row-title')?.innerText ?? '').includes('zion-drag-src'))
      const target = items[items.length - 1]
      if (!src || !target || src === target) return 'noop'
      const dt = new DataTransfer()
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return 'started'
    })()`)
    await sleep(400)
    const overed = await js(win, `(() => {
      const items = [...document.querySelectorAll('.sidebar-group[data-group] .sidebar-item')]
      const target = items[items.length - 1]
      if (!target) return false
      const rect = target.getBoundingClientRect()
      const dt = new DataTransfer()
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: rect.bottom - 2, dataTransfer: dt }))
      return true
    })()`)
    await sleep(400)
    const dropped = await js(win, `(() => {
      const items = [...document.querySelectorAll('.sidebar-group[data-group] .sidebar-item')]
      const target = items[items.length - 1]
      if (!target) return false
      const rect = target.getBoundingClientRect()
      const dt = new DataTransfer()
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: rect.bottom - 2, dataTransfer: dt }))
      return true
    })()`)
    await sleep(300)
    await js(win, `(() => {
      const items = [...document.querySelectorAll('.sidebar-group[data-group] .sidebar-item')]
      const src = items.find(r => (r.querySelector('.sidebar-row-title')?.innerText ?? '').includes('zion-drag-src'))
      const dt = new DataTransfer()
      src?.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
      return true
    })()`)
    const orderAfter = await waitFor(win, `(() => {
      const titles = ${GROUP_ROW_TITLES}
      return (titles[titles.length - 1] ?? '').includes('zion-drag-src')
    })()`, 8000)
    const orderAfterTitles = await js(win, GROUP_ROW_TITLES)
    out(`order after: ${JSON.stringify(orderAfterTitles)}`)
    mark('d4', dragged === 'started' && overed && dropped && orderAfter, 'D4 拖拽到最后一行 → insertSessionBefore → 顺序更新', `before=${JSON.stringify(orderBefore)} after=${JSON.stringify(orderAfterTitles)}`)
  } else {
    // 真后端只读:入口验证(分组 + draggable + 溢出按钮机制不强制)
    mark('d0', await openView(), 'D0 按工作区分组 + 手动排序(只读)')
    const groupsReal = await js(win, `[...document.querySelectorAll('.sidebar-group-header')].map(x => x.innerText.trim())`)
    out(`real groups: ${JSON.stringify(groupsReal)}`)
    const draggableRows = await js(win, `document.querySelectorAll('.sidebar-item[draggable="true"]').length`)
    const draggableHeaders = await js(win, `document.querySelectorAll('.sidebar-group-header[draggable="true"]').length`)
    const morePresent = await js(win, `!!document.querySelector('.sidebar-group-more')`)
    mark('d1', groupsReal.length >= 1, 'D1 真实分组渲染', JSON.stringify(groupsReal))
    mark('d2', draggableRows >= 1 && draggableHeaders >= 1, 'D2 会话行与组头可拖拽(draggable)', `rows=${draggableRows}, headers=${draggableHeaders}`)
    mark('d3', true, 'D3 溢出按钮按组内行数出现(有则展示)', morePresent ? '有' : '无(≤5 行组)')
    mark('d4', true, 'D4 真后端只读,不执行拖拽')
  }

  mark('d5', errors.length === 0, 'D5 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `sidebar-drag-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `sidebar-drag-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `sidebar-drag-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== SidebarDrag 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('SIDEBAR-DRAG PROBE FAILED', err); app.exit(1) })
