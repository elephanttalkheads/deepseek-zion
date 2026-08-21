// Queue steer/remove 端到端 probe against the REAL backend, speaking the
// wire directly (sessions.create + sessions.prompt) — no UI-selection needed.
// Creates a NEW session, prompts once (turn starts -> running), prompts again
// (queue mode -> session/queue frame with a queued row), selects the session
// in the replica UI to mount QueueDock, verifies queued row + 插队/移除 actions,
// and exercises updateQueue (steer) via the wire. NOTE: runs a real agent turn.
// Usage: npx electron probe-queue-ops.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-queue-ops-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 12000, every = 500) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}

const WIRE = (win, method, payload) => js(win, `(async () => {
  const rpcId = crypto.randomUUID()
  const res = await fetch('/api/${method}', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: '${method}', payload: ${JSON.stringify(payload)} }),
  })
  const full = await res.json()
  return full
})()`)

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }
  out(`badge: ${await js(win, `document.querySelector('.shell-badge')?.innerText ?? ''`)}`)

  out('--- create new session ---')
  const createRes = await WIRE(win, 'session.create', {})
  const sessionId = createRes.result?.ok === true ? createRes.result.value.sessionId : null
  out(`session created: ${sessionId ?? JSON.stringify(createRes.result)}`)
  if (sessionId === null) { out('ABORT: no session'); app.exit(1); return }

  out('--- prompt #1 (start turn) ---')
  // 让首个 turn 跑得足够久:短任务会在探针轮询前完结并把排队消息消费掉(时序抖动)。
  const p1 = await WIRE(win, 'session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: '从 1 数到 300,每个数字一行,不要省略,不要做其他事。' }], clientTimeZone: 'UTC' })
  out(`prompt1: ok=${p1.result?.ok}`)
  await sleep(800)

  out('--- prompt #2 (queue mode follows active turn) ---')
  const p2 = await WIRE(win, 'session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: '第二条:排队展示用,请不要回答。' }], clientTimeZone: 'UTC' })
  out(`prompt2: ok=${p2.result?.ok}`)

  out('--- select session in replica UI (mount QueueDock) ---')
  const selected = await js(win, `(() => {
    const rows = [...document.querySelectorAll('.sidebar-row')]
    const row = rows.find(e => e.getAttribute('data-session') || true)
    // click the newest session (first row typically); prefer by title if token appears
    const target = rows.find(e => e.innerText.includes('从 1 数到') || e.innerText.includes('排队展示')) ?? rows[0]
    if (target) { target.click(); return target.innerText.replace(/\\n/g,' ') }
    return null
  })()`)
  out(`selected: ${selected}`)
  await sleep(1500)

  out('--- wait for queued row ---')
  const q = await waitFor(win, `!!document.querySelector('.queue-row[data-placement="queued"]')`, 8000, 500)
  out(`queued row rendered: ${q}`)
  const qText = await js(win, `[...document.querySelectorAll('.queue-row')].map(e => e.innerText).join(' | ')`)
  out(`queue rows: ${qText}`)
  const actions = await js(win, `[...document.querySelectorAll('.queue-row[data-placement="queued"] .queue-action')].map(b => b.innerText).join(',')`)
  out(`queued row actions: ${actions || '(none)'}`)

  out('--- updateQueue steer via UI button (queued row) ---')
  const clicked = await js(win, `(() => {
    const b = [...document.querySelectorAll('.queue-row[data-placement="queued"] .queue-action')].find(x => x.innerText === '插队')
    if (b) { b.click(); return true } return false
  })()`)
  out(`steer button clicked: ${clicked}`)
  await sleep(1200)
  const afterSteer = await js(win, `[...document.querySelectorAll('.queue-row')].map(e => e.getAttribute('data-placement')).join(',')`)
  out(`queue placements after steer: ${afterSteer || '(none)'}`)
  const errStrip = await js(win, `document.querySelector('.input-bar-error')?.innerText ?? ''`)
  out(`input error strip: ${errStrip || '(empty)'}`)

  const settingsCard = await js(win, `document.querySelectorAll('.details-plugins, .queue-actions').length`)
  out(`queue action controls present: ${settingsCard}`)

  // 挂载点断言(2026-08-21 合并形态):QueueDock 挪进 InputBar 的 dock 排
  const mountOk = await js(win, `!!document.querySelector('.input-bar .input-bar-dock .queue-dock')`)
  out(`queue dock mounted in input-bar dock row: ${mountOk}`)

  fs.writeFileSync(path.join(OUT, 'queue-ops.txt'), lines.join('\n'))
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'queue-ops.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'queue-ops-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('QUEUE OPS PROBE FAILED', err); app.exit(1) })
