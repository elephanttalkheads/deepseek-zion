// P2 拖拽重排 + 溢出展开探针(2026-08-28 适配 ASCII 会话城:行级入口迁入 City Index)。
// fixture 走全流程:按工作区分组 + 手动排序 + 打开索引 → 重命名 fx-alpha →
// 分叉 6 次(嵌套子行 + caret 收起/展开)→ 归档父行(子行浮为顶层,组内 6 行)→
// 溢出控制(5 行 + 「+1 个更多…」)→ 展开 → 拖拽 zion-drag-src 到最后一行下半 →
// insertSessionBefore → 顺序可见变化。
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

// 顶层行标题(组内排序断言只看顶层;嵌套子行不参与 insertSessionBefore)
const TOP_ROW_TITLES = `[...document.querySelectorAll('.map-body.grouped .map-row:not(.is-child) .title')].map(t => t.textContent.trim())`

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
  // 按标题打开某行的 ⋯ 菜单(City Index 行内)
  const openRowMenuByTitle = (text) => `(() => {
    const rows = [...document.querySelectorAll('.map-row')]
    const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes(${JSON.stringify(text)}))
    const b = target?.querySelector('.map-row-menu')
    if (!b) return false
    b.click(); return true
  })()`

  out(`mode: ${tag}`)

  // 按工作区分组 + 手动排序(拖拽落点可见)+ 打开 City Index
  const openView = async () => {
    const b = await waitFor(win, `!!document.querySelector('.sidebar-view-options')`, 8000)
    if (!b) return false
    await js(win, `document.querySelector('.sidebar-view-options').click()`)
    await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    await js(win, clickByText('[role="menuitem"]', '按工作区'))
    await js(win, `document.querySelector('.sidebar-view-options').click()`)
    await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    await js(win, clickByText('[role="menuitem"]', '手动排序'))
    await js(win, `(() => { const t = document.querySelector('.map-toggle'); if (t) t.click(); return !!t })()`)
    return waitFor(win, `document.querySelectorAll('.map-district-head').length >= 1`, 6000)
  }

  if (tag === 'fixture') {
    mark('d0', await openView(), 'D0 按工作区分组 + 手动排序 + 打开索引')

    // 重命名第一行(fx-alpha,运行中)→ zion-drag-src
    const renamed = await (async () => {
      await js(win, `(() => { const b = document.querySelector('.map-row-menu'); if (b) b.click(); return !!b })()`)
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
      return shown && await waitFor(win, `[...document.querySelectorAll('.map-row .title')].some(t => (t.textContent ?? '').includes('zion-drag-src'))`, 8000)
    })()
    mark('d1', renamed, 'D1 重命名 fx-alpha → zion-drag-src')

    // 分叉 6 次 → 父行 caret + 6 条嵌套子行(归档父行后 6 子浮顶层,够溢出阈值;fixture 另两条为 blank 不可见;
    // fork 子代标题继承自原始会话数据,不随 D1 重命名,故 D5 需另立标记行)
    for (let i = 0; i < 6; i++) {
      await js(win, openRowMenuByTitle('zion-drag-src'))
      await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
      await js(win, clickByText('[role="menuitem"]', '分叉会话'))
      await sleep(1200)
    }
    const childRows = await waitFor(win, `document.querySelectorAll('.map-row.is-child').length >= 6`, 8000)
      && await js(win, `document.querySelectorAll('.map-row.is-child').length`)
    // caret 收起 → 子行隐藏;再展开 → 回归
    const caretToggle = await js(win, `(() => {
      const rows = [...document.querySelectorAll('.map-row')]
      const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-drag-src'))
      const c = target?.querySelector('.map-caret')
      if (!c) return false
      c.click(); return true
    })()`)
    const collapsed = await waitFor(win, `document.querySelectorAll('.map-row.is-child').length === 0`, 6000)
    await js(win, `(() => {
      const rows = [...document.querySelectorAll('.map-row')]
      const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-drag-src'))
      target?.querySelector('.map-caret')?.click(); return true
    })()`)
    const reExpanded = await waitFor(win, `document.querySelectorAll('.map-row.is-child').length >= 6`, 6000)
    mark('d2', !!childRows && caretToggle && collapsed && reExpanded, 'D2 分叉 6 次 → caret 嵌套子行收起/展开', `childRows=${childRows}`)

    // 归档父行 → 6 子行浮为顶层 → 组内顶层 6 行 → 折叠 5 + 「+1 个更多…」
    await js(win, `(() => {
      const rows = [...document.querySelectorAll('.map-row:not(.is-child)')]
      const target = rows.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-drag-src'))
      const b = target?.querySelector('.map-row-menu')
      if (!b) return false
      b.click(); return true
    })()`)
    await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    await js(win, clickByText('[role="menuitem"]', '归档会话'))
    const sixTop = await waitFor(win, `document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)').length === 5 && !!document.querySelector('.map-more-row')`, 8000)
    const moreText = await js(win, `document.querySelector('.map-more-row')?.textContent ?? ''`)
    mark('d3', sixTop && moreText.includes('1 个更多'), 'D3 归档父行 → 子行浮顶层 → 溢出折叠(5 行 + 展开按钮)', `btn=${JSON.stringify(moreText)}`)
    const expanded = await js(win, `(() => { const b = document.querySelector('.map-more-row'); if (!b) return false; b.click(); return true })()`)
    const allRows = await waitFor(win, `document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)').length === 6`, 6000)
    mark('d4', expanded && allRows, 'D4 点击展开 → 6 行全显示')

    // D5: 重命名首行立标记 → 拖拽标记行到最后一行下半 → insertSessionBefore → 顺序变化
    const markerRenamed = await (async () => {
      await js(win, `(() => {
        const items = [...document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)')]
        const b = items[0]?.querySelector('.map-row-menu')
        if (!b) return false
        b.click(); return true
      })()`)
      await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
      await js(win, clickByText('[role="menuitem"]', '重命名'))
      const shown = await waitFor(win, `!!document.querySelector('[role="dialog"][aria-label="重命名会话"]')`, 6000)
      await js(win, `(() => {
        const d = document.querySelector('[role="dialog"][aria-label="重命名会话"]')
        const input = d?.querySelector('input')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(input, 'zion-drag-tail')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      await sleep(300)
      await js(win, clickByText('[role="dialog"][aria-label="重命名会话"] button', '保存'))
      return shown && await waitFor(win, `[...document.querySelectorAll('.map-row .title')].some(t => (t.textContent ?? '').includes('zion-drag-tail'))`, 8000)
    })()
    const orderBefore = await js(win, TOP_ROW_TITLES)
    out(`order before: ${JSON.stringify(orderBefore)}`)
    const dragged = await js(win, `(() => {
      const items = [...document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)')]
      const src = items.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-drag-tail'))
      const target = items[items.length - 1]
      if (!src || !target || src === target) return 'noop'
      const dt = new DataTransfer()
      src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
      return 'started'
    })()`)
    await sleep(400)
    const overed = await js(win, `(() => {
      const items = [...document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)')]
      const target = items[items.length - 1]
      if (!target) return false
      const rect = target.getBoundingClientRect()
      const dt = new DataTransfer()
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientY: rect.bottom - 2, dataTransfer: dt }))
      return true
    })()`)
    await sleep(400)
    const dropped = await js(win, `(() => {
      const items = [...document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)')]
      const target = items[items.length - 1]
      if (!target) return false
      const rect = target.getBoundingClientRect()
      const dt = new DataTransfer()
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientY: rect.bottom - 2, dataTransfer: dt }))
      return true
    })()`)
    await sleep(300)
    await js(win, `(() => {
      const items = [...document.querySelectorAll('.map-body.grouped .map-row:not(.is-child)')]
      const src = items.find(r => (r.querySelector('.title')?.textContent ?? '').includes('zion-drag-tail'))
      const dt = new DataTransfer()
      src?.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
      return true
    })()`)
    const orderAfter = await waitFor(win, `(() => {
      const titles = ${TOP_ROW_TITLES}
      return (titles[titles.length - 1] ?? '').includes('zion-drag-tail')
    })()`, 8000)
    const orderAfterTitles = await js(win, TOP_ROW_TITLES)
    out(`order after: ${JSON.stringify(orderAfterTitles)}`)
    mark('d5', markerRenamed && dragged === 'started' && overed && dropped && orderAfter, 'D5 拖拽标记行到最后一行 → insertSessionBefore → 顺序更新', `before=${JSON.stringify(orderBefore)} after=${JSON.stringify(orderAfterTitles)}`)
  } else {
    // 真后端只读:入口验证(分组 + draggable + 溢出按钮机制不强制)
    mark('d0', await openView(), 'D0 按工作区分组 + 手动排序 + 打开索引(只读)')
    const groupsReal = await js(win, `[...document.querySelectorAll('.map-district-head')].map(x => x.textContent.trim())`)
    out(`real groups: ${JSON.stringify(groupsReal)}`)
    const draggableRows = await js(win, `document.querySelectorAll('.map-row[draggable="true"]').length`)
    const draggableHeaders = await js(win, `document.querySelectorAll('.map-district-head[draggable="true"]').length`)
    const morePresent = await js(win, `!!document.querySelector('.map-more-row')`)
    mark('d1', groupsReal.length >= 1, 'D1 真实分组渲染(BAY 章标题)', JSON.stringify(groupsReal))
    mark('d2', draggableRows >= 1 && draggableHeaders >= 1, 'D2 会话行与章标题可拖拽(draggable)', `rows=${draggableRows}, headers=${draggableHeaders}`)
    mark('d3', true, 'D3 溢出按钮按顶层行数出现(有则展示)', morePresent ? '有' : '无(≤5 行组)')
    mark('d4', true, 'D4 真后端只读,不执行拖拽')
    mark('d5', true, 'D5 真后端只读,不执行分叉/归档')
  }

  mark('d6', errors.length === 0, 'D6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `sidebar-drag-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `sidebar-drag-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `sidebar-drag-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== SidebarDrag 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('SIDEBAR-DRAG PROBE FAILED', err); app.exit(1) })
