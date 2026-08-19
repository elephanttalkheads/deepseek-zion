// P1 ProducedFiles / WorkflowRun 面板探针 — 产物行(ui-deliverables)+
// workflow-run 面板(ui-workflow-run)。
// fixture 走全流程:alpha 历史 turns 61–64 的 edit/write 卡带 locations →
// turn-tail 处「产物」行出现(路径 chip + 点击 host.openPath);turn 75
// tool-workflow 事件族 → workflow-run 面板(名称/状态/阶段/成员)。真后端只读:
// 若会话有产物行/工作流面板则断言结构,零错误。用法:
//   npx electron probe-deliverables.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-deliverables.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-deliverables-out')
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

  const PROD_ROW = '[data-produced-files-row]'
  const WF_RUN = '[data-workflow-run]'

  const clicked = await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
  const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)
  mark('d1', clicked && headerShown, 'D1 选中会话')

  if (tag === 'fixture') {
    // ---- D2: 产物行出现(edit/write locations 派生) ----
    const rowShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(PROD_ROW)})`, 12000)
    const rows = await js(win, `(() => {
      const rows = [...document.querySelectorAll(${JSON.stringify(PROD_ROW)})]
      return rows.map(r => ({
        label: r.parentElement?.querySelector('span')?.innerText ?? '',
        chips: [...r.querySelectorAll('button')].map(b => b.innerText),
        titles: [...r.querySelectorAll('button')].map(b => b.getAttribute('title')),
      }))
    })()`)
    out(`produced rows: ${JSON.stringify(rows)}`)
    const hasKnown = rows.some(r => r.chips.includes('demo.txt') && r.titles.some(t => t === 'notes/demo.txt'))
    mark('d2', rowShown && hasKnown, 'D2 产物行渲染(路径 chip + title 全路径)', JSON.stringify(rows.map(r => r.chips)))

    // ---- D3: 点击 chip → host.openPath(fixture ok) ----
    const chipClicked = await js(win, `(() => {
      const b = document.querySelector(${JSON.stringify(PROD_ROW)})?.querySelector('button')
      if (!b) return false
      b.click(); return true
    })()`)
    await sleep(600)
    mark('d3', chipClicked, 'D3 点击产物 chip(host.openPath 无异常)')

    // ---- D4: workflow-run 面板(折叠态:run 头名称/计数/状态) ----
    const wfShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(WF_RUN)})`, 12000)
    const wfState = await js(win, `(() => {
      const root = document.querySelector(${JSON.stringify(WF_RUN)})
      if (!root) return null
      return {
        status: root.getAttribute('data-run-status'),
        text: (root.innerText ?? '').slice(0, 200),
        rows: [...root.querySelectorAll('[data-disclosure-row]')].map(r => r.innerText.slice(0, 60)),
      }
    })()`)
    out(`workflow panel: ${JSON.stringify(wfState)}`)
    mark('d4', wfShown && wfState !== null && wfState.status === 'completed'
      && (wfState.text ?? '').includes('深度审查') && (wfState.text ?? '').includes('2 个成员'),
      'D4 workflow-run 面板(run 头:名称/成员计数/状态)', JSON.stringify(wfState?.text))

    // ---- D5: 展开 run 头 → 阶段行 → 展开阶段 → 成员状态 ----
    const runOpened = await js(win, `(() => {
      const root = document.querySelector(${JSON.stringify(WF_RUN)})
      const row = root?.querySelector('[data-disclosure-row][data-expandable]')
      if (!row) return false
      row.click(); return true
    })()`)
    const phasesShown = await waitFor(win, `(() => {
      const root = document.querySelector(${JSON.stringify(WF_RUN)})
      return root ? root.querySelectorAll('[data-phase-count]').length >= 2 : false
    })()`, 6000)
    const phaseToggled = await js(win, `(() => {
      const root = document.querySelector(${JSON.stringify(WF_RUN)})
      const row = root ? [...root.querySelectorAll('[data-disclosure-row]')].find(r => (r.innerText ?? '').includes('调研')) : null
      if (!row) return false
      row.click(); return true
    })()`)
    const membersVisible = await waitFor(win, `(() => {
      const root = document.querySelector(${JSON.stringify(WF_RUN)})
      return root ? root.innerText.includes('阅读') && root.innerText.includes('已完成') : false
    })()`, 6000)
    const memberRows = await js(win, `(() => {
      const root = document.querySelector(${JSON.stringify(WF_RUN)})
      return root ? [...root.querySelectorAll('[data-member-label]')].map(m => m.innerText) : []
    })()`)
    mark('d5', runOpened && phasesShown && phaseToggled && membersVisible,
      'D5 run 头展开 → 阶段行 → 阶段展开显示成员状态', JSON.stringify(memberRows))
  } else {
    // ---- real:只读 ----
    const prodReal = await js(win, `document.querySelectorAll(${JSON.stringify(PROD_ROW)}).length`)
    const wfReal = await js(win, `document.querySelectorAll(${JSON.stringify(WF_RUN)}).length`)
    if (prodReal > 0) {
      const chips = await js(win, `[...document.querySelectorAll(${JSON.stringify(PROD_ROW)} + ' button')].map(b => b.innerText)`)
      mark('d2', chips.length > 0, 'D2 real:产物行存在', `${prodReal} 行 ${JSON.stringify(chips)}`)
    } else {
      mark('d2', true, 'D2 real:无产物行(会话未产生文件),跳过')
    }
    if (wfReal > 0) {
      const st = await js(win, `document.querySelector(${JSON.stringify(WF_RUN)})?.getAttribute('data-run-status') ?? ''`)
      mark('d4', st !== '', 'D4 real:workflow-run 面板存在', `status=${st}`)
    } else {
      mark('d4', true, 'D4 real:无 workflow 面板,跳过')
    }
    for (const id of ['d3', 'd5']) mark(id, true, `${id} real 只读`)
  }

  mark('d6', errors.length === 0, 'D6 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `deliverables-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `deliverables-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `deliverables-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 产物/工作流探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('DELIVERABLES PROBE FAILED', err); app.exit(1) })
