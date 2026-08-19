// P1 信息层探针 — ContextMeter(上下文占用环 + 组成面板)、StatsLine(会话统计条)、
// TodoDock(plan strip)。fixture 用 fx-alpha(运行中,富历史,投影齐全);真后端
// 遍历空闲根行直到统计条/环出现(空白会话无投影)。只读,不写任何状态。用法:
//   npx electron probe-composer-stats.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-composer-stats.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-composer-stats-out')
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

  out(`mode: ${tag}`)

  // 选会话:fixture → 第一行(fx-alpha 运行中,富历史);real → 遍历空闲根行直到有投影
  if (tag === 'fixture') {
    await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
  } else {
    const found = await (async () => {
      for (let i = 0; i < 20; i++) {
        const state = await js(win, `(() => {
          const items = [...document.querySelectorAll('.sidebar-item')]
          const t = items[${i}]
          if (!t) return 'done'
          if (t.hasAttribute('data-running') || (t.style.paddingLeft ?? '') !== '10px') return 'skip'
          t.querySelector('.sidebar-row')?.click(); return 'clicked'
        })()`)
        if (state === 'done') return false
        if (state === 'skip') continue
        await sleep(1500)
        const has = await js(win, `!!document.querySelector('[data-testid="todo-panel"], .input-bar-foot button[aria-label*="上下文已用"]')`)
        if (has) return true
      }
      return false
    })()
    mark('s0', found, 'S0 选中带投影的非运行根会话')
  }
  await sleep(1500)

  // C1: TodoDock plan strip(fixture:fx-alpha 有 todo/write;real:todos=null → 不渲染)
  const todoShown = await waitFor(win, `!!document.querySelector('[data-testid="todo-panel"]')`, 6000)
  const todoText = await js(win, `document.querySelector('[data-testid="todo-panel"]')?.innerText ?? ''`)
  out(`todo panel: ${JSON.stringify(todoText.slice(0, 120))}`)
  if (tag === 'fixture') {
    mark('c1', todoShown && todoText.includes('任务'), 'C1 TodoDock plan strip 渲染(任务 + 进度)', JSON.stringify(todoText.slice(0, 80)))
    // 展开列表
    const expanded = await js(win, `(() => {
      const p = document.querySelector('[data-testid="todo-panel"]')
      const b = p?.querySelector('button')
      if (!b) return false
      b.click(); return true
    })()`)
    const items = await waitFor(win, `document.querySelectorAll('[data-testid="todo-panel"] li').length >= 1`, 6000)
    const itemCount = await js(win, `document.querySelectorAll('[data-testid="todo-panel"] li').length`)
    mark('c2', expanded && items, 'C2 展开后列出 todo 项', `count=${itemCount}`)
  } else {
    mark('c1', !todoShown, 'C1 真后端 todos=null → TodoDock 不渲染')
    mark('c2', true, 'C2 真后端只读,无 todo 项')
  }

  // C3: StatsLine 统计条
  const statsShown = await waitFor(win, `(() => {
    const bar = document.querySelector('.input-bar')
    return bar !== null && (bar.innerText ?? '').includes('轮 ·')
  })()`, 6000)
  const statsLine = await js(win, `(() => {
    const bar = document.querySelector('.input-bar')
    const line = (bar?.innerText ?? '').split(String.fromCharCode(10)).find(x => x.includes('轮 ·')) ?? ''
    return line.trim()
  })()`)
  out(`stats line: ${JSON.stringify(statsLine)}`)
  mark('c3', statsShown, 'C3 StatsLine 统计条渲染(轮 · 步)', JSON.stringify(statsLine.slice(0, 100)))

  // C4: ContextMeter 环 + 面板
  const meterShown = await waitFor(win, `!!document.querySelector('.input-bar-foot button[aria-label*="上下文已用"]')`, 6000)
  const meterLabel = await js(win, `document.querySelector('.input-bar-foot button[aria-label*="上下文已用"]')?.getAttribute('aria-label') ?? ''`)
  out(`meter label: ${JSON.stringify(meterLabel)}`)
  mark('c4', meterShown && /\d+%/.test(meterLabel), 'C4 ContextMeter 环渲染(带百分比)', JSON.stringify(meterLabel))
  const panelOpened = await js(win, `(() => {
    const b = document.querySelector('.input-bar-foot button[aria-label*="上下文已用"]')
    if (!b) return false
    b.click(); return true
  })()`)
  const panelShown = await waitFor(win, `!!document.querySelector('[role="dialog"][aria-label="上下文已用"]')`, 6000)
  const panelRows = await js(win, `(() => {
    const d = document.querySelector('[role="dialog"][aria-label="上下文已用"]')
    if (!d) return []
    return [...d.querySelectorAll('dt')].map(x => x.innerText.trim())
  })()`)
  out(`meter panel rows: ${JSON.stringify(panelRows)}`)
  mark('c5', panelOpened && panelShown && ['系统提示词', '工具', '对话消息'].every(r => panelRows.includes(r)),
    'C5 点击环展开组成面板(系统提示词/工具/对话消息)', JSON.stringify(panelRows))

  mark('c6', errors.length === 0, 'C6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `composer-stats-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `composer-stats-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `composer-stats-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== ComposerStats 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('COMPOSER-STATS PROBE FAILED', err); app.exit(1) })
