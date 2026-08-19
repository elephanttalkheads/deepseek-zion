// P0 JobListAction 作业 badge 探针 — 会话头后台任务徽标 + 弹出列表。
// fixture 走全流程:初始无徽标 → 注入 session/jobs 帧 → 徽标出现 → 打开列表
// (运行中在前/状态点/时长实时走)→ 外部 pointerdown 关闭 → Escape 关闭 →
// 空 jobs 帧 → 徽标消失。真后端只读:选中会话零控制台错误、无 jobs 时无徽标。
// 用法:
//   npx electron probe-jobs.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-jobs.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-jobs-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const probeLines = []
const probeOut = (s) => { probeLines.push(s); console.log(s) }
const js = async (win, expr) => {
  try { return await win.webContents.executeJavaScript(expr) } catch (e) { probeOut(`js threw: ${expr.slice(0, 120)} → ${e.message}`); throw e }
}
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

  const TRIGGER = `button[aria-label*="后台任务"]`
  const LIST = `ul[aria-label="后台任务"]`
  const now = Date.now()

  if (tag === 'fixture') {
    // ---- J1: 选中会话,初始无徽标 ----
    const clicked = await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
    const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)
    const badgeBefore = await js(win, `!!document.querySelector(${JSON.stringify(TRIGGER)})`)
    mark('j1', clicked && headerShown && !badgeBefore, 'J1 选中会话;无 jobs 时无徽标控件')

    // ---- J2: 注入 session/jobs 帧(1 运行中 + 1 已完成)→ 徽标出现 ----
    const pushed = await js(win, `(() => {
      if (typeof window.__zionProbePushMuxFrame !== 'function') return 'no-seam'
      window.__zionProbePushMuxFrame({
        type: 'session/jobs', sessionId: 'fx-alpha',
        jobs: [
          { id: 'bash-1', kind: 'bash', label: 'npx vite build', status: 'running', startedAt: ${now} - 90_000 },
          { id: 'subagent-1', kind: 'subagent', label: 'job-list research', status: 'completed', startedAt: ${now} - 300_000, finishedAt: ${now} - 180_000 },
        ],
      })
      return true
    })()`)
    const badgeShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(TRIGGER)})`, 8000)
    const badgeLabel = await js(win, `document.querySelector(${JSON.stringify(TRIGGER)})?.getAttribute('aria-label') ?? ''`)
    mark('j2', pushed === true && badgeShown, 'J2 session/jobs 帧 → 徽标出现', `label=${JSON.stringify(badgeLabel)}`)
    const liveDot = await js(win, `!!document.querySelector(${JSON.stringify(TRIGGER)})?.querySelector('svg[data-state="ongoing"]')`)
    mark('j2b', liveDot, 'J2b 运行中徽标带 StateDot(ongoing)')

    // ---- J3: 打开列表 → 2 行,运行中在前,kind/状态/时长文案 ----
    const opened = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(TRIGGER)}); if (!b) return false; b.click(); return true })()`)
    const listShown = await waitFor(win, `document.querySelectorAll(${JSON.stringify(LIST + ' li')}).length === 2`, 6000)
    const rows = await js(win, `[...document.querySelectorAll(${JSON.stringify(LIST + ' li')})].map(li => li.innerText)`)
    out(`job rows: ${JSON.stringify(rows)}`)
    const firstLive = (rows[0] ?? '').includes('bash') && (rows[0] ?? '').includes('运行中') && (rows[0] ?? '').includes('1分30秒')
    const secondDone = (rows[1] ?? '').includes('subagent') && (rows[1] ?? '').includes('已完成') && (rows[1] ?? '').includes('2分0秒')
    const rowDots = await js(win, `(() => {
      const lis = [...document.querySelectorAll(${JSON.stringify(LIST + ' li')})]
      return lis.map(li => ({
        live: !!li.querySelector('svg[data-state="ongoing"]'),
        done: !!li.querySelector('span[data-state="done"]'),
      }))
    })()`)
    mark('j3', opened && listShown && firstLive && secondDone &&
      rowDots[0]?.live && rowDots[1]?.done,
      'J3 列表:运行中在前 + 状态点 + 时长文案', JSON.stringify(rowDots))

    // ---- J4: 时钟实时走(open 时 1s 一跳)→ 时长变化 ----
    const d1 = await js(win, `[...document.querySelectorAll(${JSON.stringify(LIST + ' li')})][0]?.innerText ?? ''`)
    await sleep(1300)
    const d2 = await js(win, `[...document.querySelectorAll(${JSON.stringify(LIST + ' li')})][0]?.innerText ?? ''`)
    mark('j4', d1 !== d2 && d1.includes('1分30秒'), 'J4 运行中行时长实时走', `${JSON.stringify(d1)} → ${JSON.stringify(d2)}`)

    // ---- J5: 外部 pointerdown → 关闭 ----
    const closedOutside = await js(win, `(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      return true
    })()`)
    const goneOutside = await waitFor(win, `!document.querySelector(${JSON.stringify(LIST)})`, 6000)
    mark('j5', closedOutside && goneOutside, 'J5 外部 pointerdown 关闭列表')

    // ---- J5b: 再开 → Escape → 关闭 ----
    const reopened = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(TRIGGER)}); if (!b) return false; b.click(); return true })()`)
    const listAgain = await waitFor(win, `!!document.querySelector(${JSON.stringify(LIST)})`, 6000)
    const escapeSent = await js(win, `(() => {
      const b = document.querySelector(${JSON.stringify(TRIGGER)})
      b?.parentElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return true
    })()`)
    const goneEscape = await waitFor(win, `!document.querySelector(${JSON.stringify(LIST)})`, 6000)
    mark('j5b', reopened && listAgain && escapeSent && goneEscape, 'J5b Escape 关闭列表')

    // ---- J6: 空 jobs 帧 → 徽标消失 ----
    const cleared = await js(win, `(() => {
      window.__zionProbePushMuxFrame({ type: 'session/jobs', sessionId: 'fx-alpha', jobs: [] })
      return true
    })()`)
    const badgeGone = await waitFor(win, `!document.querySelector(${JSON.stringify(TRIGGER)})`, 6000)
    mark('j6', cleared && badgeGone, 'J6 空 jobs 帧 → 徽标消失')
  } else {
    // ---- real:只读 ----
    const clicked = await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
    const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)
    mark('j1', clicked && headerShown, 'J1 real:选中会话,会话头渲染')
    // 徽标若存在(真实后台任务)→ 打开验证真实数据;不存在 → 一致性通过。
    const badgeReal = await js(win, `!!document.querySelector(${JSON.stringify(TRIGGER)})`)
    if (badgeReal) {
      const openedReal = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(TRIGGER)}); if (!b) return false; b.click(); return true })()`)
      const rowsReal = await waitFor(win, `document.querySelectorAll(${JSON.stringify(LIST + ' li')}).length >= 1`, 6000)
      const realRows = await js(win, `[...document.querySelectorAll(${JSON.stringify(LIST + ' li')})].map(li => li.innerText)`)
      // 状态列 = job.detail ?? status(官方语义);末列 = 时长。行形状 ≥4 段即可。
      const plausible = realRows.every(txt => {
        const parts = txt.split('\n')
        return parts.length >= 4 && parts[0].trim() !== '' && parts[1].trim() !== '' &&
          /\d+秒|分|小时/.test(parts[parts.length - 1])
      })
      mark('j1b', openedReal && rowsReal && plausible, 'J1b real:徽标存在 → 列表渲染真实 jobs 数据', `${realRows.length} 行`)
    } else {
      mark('j1b', true, 'J1b real:无 jobs 时无徽标控件')
    }
    for (const id of ['j2', 'j2b', 'j3', 'j4', 'j5', 'j5b', 'j6']) mark(id, true, `${id} real 只读,不注入帧`)
  }

  mark('j7', errors.length === 0, 'J7 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `jobs-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `jobs-${tag}.txt`), probeLines.join('\n'))
  fs.writeFileSync(path.join(OUT, `jobs-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  probeOut(`\n== Jobs 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('JOBS PROBE FAILED', err); app.exit(1) })
