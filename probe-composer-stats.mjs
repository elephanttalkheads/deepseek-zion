// P1 信息层探针(2026-08-21 输入栏合并形态落地后更新)— StatsLine(会话统计条,
// 位置 = 输入框底部)、TodoDock(自研 Matrix 版 plan strip:整头可点 + 计数汇总 +
// 展开/收起交互)。ContextMeter 环已按评审裁决移除(ui-change-log 2026-08-21),
// 原 C4/C5(环 + 组成面板)断言删除,C4 改为「环不存在 + StatsLine 在 foot 之后」。
// fixture 用 fx-alpha(运行中,富历史,投影齐全);真后端遍历空闲根行直到统计条出现
// (空白会话无投影)。只读,不写任何状态。用法:
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

  // 选会话:fixture → 第一行(fx-alpha 运行中,富历史);real → 遍历空闲根行直到有统计条
  if (tag === 'fixture') {
    await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
    await sleep(1500)
    // fx-alpha 常驻 approval+question 会接管 composer(同 probe-queue-edit):
    // 先用 resolved 帧结算,直到 InputBar 回归。
    const pushFrame = (frame) => js(win, `window.__zionProbePushMuxFrame(${JSON.stringify(frame)})`)
    if (await js(win, `!!document.querySelector('[data-approval-key]')`)) {
      await pushFrame({ type: 'approval/resolved', sessionId: 'fx-alpha', approvalId: 'fx-approval-1' })
      await waitFor(win, `!!document.querySelector('[data-question-key]')`, 8000)
      await pushFrame({ type: 'question/resolved', sessionId: 'fx-alpha', questionRpcId: 'fx-rpc-question' })
      await waitFor(win, `!document.querySelector('[data-question-key]')`, 8000)
    }
    await waitFor(win, `!!document.querySelector('.input-bar-textarea')`, 8000)
    // fx-alpha 的 todo/write 在 turn 74,其后 turn 75–78 的 turn/start 已把
    // standing plan 清空(host 语义:新 turn 退休旧 plan)→ todos=null。为确定性
    // 断言 TodoDock,经探针缝注入 todos 投影帧(同 probe-jobs 的既定手法)。
    await pushFrame({
      type: 'session/projection', sessionId: 'fx-alpha', key: 'todos', seq: 99999,
      value: [
        { content: '梳理需求', status: 'completed' },
        { content: '实现 fixture 样本', status: 'in_progress' },
        { content: '跑后台构建', status: 'in_progress' },
        { content: '浏览器验收', status: 'pending' },
      ],
    })
  } else {
    const found = await (async () => {
      for (let i = 0; i < 20; i++) {
        const state = await js(win, `(() => {
          const items = [...document.querySelectorAll('.sidebar-item')]
          const t = items[${i}]
          if (!t) return 'done'
          if (t.hasAttribute('data-running')) return 'skip'
          t.querySelector('.sidebar-row')?.click(); return 'clicked'
        })()`)
        if (state === 'done') return false
        if (state === 'skip') continue
        await sleep(1500)
        const has = await js(win, `!!document.querySelector('[data-testid="todo-panel"], .input-bar-statsline > div')`)
        if (has) return true
      }
      return false
    })()
    mark('s0', found, 'S0 选中带投影的非运行根会话')
  }
  await sleep(1500)

  // C1: TodoDock plan strip(fixture:fx-alpha 有 todo/write;real:todos=null → 不渲染)
  const todoShown = await waitFor(win, `!!document.querySelector('[data-testid="todo-panel"]')`, 6000)
  const headText = await js(win, `document.querySelector('[data-testid="todo-panel"] .todo-dock-head')?.innerText ?? ''`)
  out(`todo dock head: ${JSON.stringify(headText.slice(0, 120))}`)
  if (tag === 'fixture') {
    mark('c1', todoShown && headText.includes('任务') && /\d+ 已完成/.test(headText) && /\d+ 进行中/.test(headText) && /\d+ 待处理/.test(headText),
      'C1 TodoDock 渲染(任务 label + 计数汇总)', JSON.stringify(headText.split(String.fromCharCode(10)).join(' ').slice(0, 80)))
    // C2: 展开/收起交互 — 点击整头 → aria-expanded=true + 任务行出现;再点 → 收起
    const collapsedByDefault = await js(win, `document.querySelector('[data-testid="todo-panel"] .todo-dock-head')?.getAttribute('aria-expanded') === 'false'`)
    await js(win, `document.querySelector('[data-testid="todo-panel"] .todo-dock-head')?.click()`)
    const expandedOk = await waitFor(win, `(() => {
      const p = document.querySelector('[data-testid="todo-panel"]')
      return p?.querySelector('.todo-dock-head')?.getAttribute('aria-expanded') === 'true'
        && p.querySelectorAll('.todo-dock-item').length >= 1
    })()`, 6000)
    const itemCount = await js(win, `document.querySelectorAll('[data-testid="todo-panel"] .todo-dock-item').length`)
    const glyphOk = await js(win, `[...document.querySelectorAll('[data-testid="todo-panel"] .todo-dock-item')].every(item => {
      const g = item.querySelector('.todo-dock-glyph')
      return g !== null && g.querySelector('svg.status-icon') !== null
        && ['completed','in_progress','pending'].includes(g.getAttribute('data-status') ?? '')
    })`)
    await js(win, `document.querySelector('[data-testid="todo-panel"] .todo-dock-head')?.click()`)
    const collapsedOk = await waitFor(win, `(() => {
      const p = document.querySelector('[data-testid="todo-panel"]')
      return p?.querySelector('.todo-dock-head')?.getAttribute('aria-expanded') === 'false'
        && p.querySelectorAll('.todo-dock-item').length === 0
    })()`, 6000)
    mark('c2', collapsedByDefault && expandedOk && glyphOk && collapsedOk,
      'C2 TodoDock 展开/收起(默认收起 → aria-expanded + 任务行 + svg.status-icon → 收起)', `count=${itemCount} glyph=${glyphOk}`)
  } else {
    // 真后端只读:选中的会话可能没有 standing plan(todos=null → 不渲染),
    // 也可能有(如本机常驻会话)→ 有则同样核对头结构。
    if (todoShown) {
      mark('c1', headText.includes('任务') && /\d+ 已完成|\d+ 进行中|\d+ 待处理/.test(headText),
        'C1 真后端 TodoDock 渲染(任务 + 计数汇总)', JSON.stringify(headText.split(String.fromCharCode(10)).join(' ').slice(0, 80)))
    } else {
      mark('c1', true, 'C1 真后端 todos=null → TodoDock 不渲染')
    }
    mark('c2', true, 'C2 真后端只读,无 todo 展开交互')
  }

  // C3: StatsLine 统计条(输入框底部)
  const statsShown = await waitFor(win, `(() => {
    const el = document.querySelector('.input-bar-statsline')
    return el !== null && (el.innerText ?? '').includes('轮 ·')
  })()`, 6000)
  const statsLine = await js(win, `(() => {
    const el = document.querySelector('.input-bar-statsline')
    const line = (el?.innerText ?? '').split(String.fromCharCode(10)).find(x => x.includes('轮 ·')) ?? ''
    return line.trim()
  })()`)
  out(`stats line: ${JSON.stringify(statsLine)}`)
  mark('c3', statsShown, 'C3 StatsLine 统计条渲染(轮 · 步)', JSON.stringify(statsLine.slice(0, 100)))

  // C3b: 微簇 .micro 单行(2026-08-21 第二轮):左 chip 与右 cluster 同行;
  // cluster = 模型紧凑触发 + ctx 胶囊条 + 会话状态。
  const microOk = await js(win, `(() => {
    const row = document.querySelector('.input-bar-modes')
    const cluster = row?.querySelector('.input-bar-modes-cluster')
    if (!row || !cluster) return false
    if (!cluster.querySelector('.input-bar-model button[aria-haspopup="menu"]')) return false
    if (!cluster.querySelector('.input-bar-ctxbar')) return false
    if (!cluster.querySelector('.input-bar-state')) return false
    const chip = row.querySelector('button')
    if (!chip) return false
    return Math.abs(chip.getBoundingClientRect().top - cluster.getBoundingClientRect().top) <= 2
  })()`)
  const microText = await js(win, `(document.querySelector('.input-bar-modes')?.innerText ?? '').split(String.fromCharCode(10)).join(' ')`)
  mark('c3b', microOk, 'C3b 微簇单行(chip + 模型触发 + ctx 胶囊 + 会话状态)', JSON.stringify(microText.slice(0, 100)))

  // C4: StatsLine 位置 = 输入盒(.input-box)之后;ContextMeter 环已移除(评审裁决)
  const positionOk = await js(win, `(() => {
    const box = document.querySelector('.input-box')
    const stats = document.querySelector('.input-bar-statsline')
    if (!box || !stats) return false
    return !!(box.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING)
  })()`)
  const meterGone = await js(win, `!document.querySelector('.input-bar button[aria-label*="上下文已用"]')`)
  mark('c4', positionOk && meterGone, 'C4 StatsLine 位于输入盒(.input-box)之后且 ContextMeter 环已移除', `pos=${positionOk} meterGone=${meterGone}`)

  mark('c5', errors.length === 0, 'C5 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `composer-stats-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `composer-stats-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `composer-stats-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== ComposerStats 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('COMPOSER-STATS PROBE FAILED', err); app.exit(1) })
