// Queue dock real-backend activation probe.
// Selects a running session in the replica (connected to 3080), reads the
// snapshot.queue data path, and sends one queued prompt to force a
// session/queue frame, then checks whether QueueDock renders a row.
// NOTE: this queues a real message on the selected (running) session — a
// deliberate acceptance action; the queued item is the literal probe text.
// Usage: npx electron probe-queue.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-queue-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 12000, every = 400) => {
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

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })

  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }

  // pick FIRST running session (fallback to any first)
  const picked = await js(win, `(() => {
    const rows = [...document.querySelectorAll('.sidebar-row')]
    const run = rows.find(e => e.innerText.includes('进行中'))
    const target = run ?? rows[0]
    if (target) { target.click(); return target.innerText.split('\\n')[0]?.slice(0, 30) ?? '?' }
    return null
  })()`)
  out(`selected: ${picked}`)
  await sleep(2000)

  // baseline queue dock state (probably absent)
  const baselineDock = await js(win, `!!document.querySelector('.queue-dock')`)
  out(`queue dock before: ${baselineDock}`)

  // send one queued message through the composer (auto mode=queue via sendPrompt)
  const taOk = await js(win, `(() => { const ta = document.querySelector('.input-bar-textarea'); if (!ta) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(ta, '队列激活探针'); ta.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  out(`textarea set: ${taOk}`)
  await sleep(300)
  const sendClicked = await js(win, `(() => { const b = [...document.querySelectorAll('.input-bar-send')][0]; if (b) { b.click(); return true } return false })()`)
  out(`send clicked: ${sendClicked}`)

  // wait up to 6s for a queue row
  const qRow = await waitFor(win, `!!document.querySelector('.queue-row')`, 8000, 500)
  out(`queue row rendered after send: ${qRow}`)
  const qText = qRow ? await js(win, `[...document.querySelectorAll('.queue-row')].map(e => e.innerText).join(' | ')`) : '(none)'
  out(`queue rows: ${qText}`)

  // screenshot + errors
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'queue-status.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'queue-status.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'queue-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('QUEUE PROBE FAILED', err); app.exit(1) })
