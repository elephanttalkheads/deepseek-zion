// Replica vs REAL backend (3080) parity probe — read-only pass.
// Loads the replica WITHOUT ?fixture so WebApiClient talks to 3080 via the
// vite /api proxy on 5199. Exercises: session list, select first session,
// conversation render, tool cards, interaction/queue docks (whichever are
// live), model selector. NO auto-prompt: only observes.
// Usage: npx electron probe-real.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-real-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function waitForJS(win, expr, waitMs = 12000) {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    if (await win.webContents.executeJavaScript(expr)) return true
    await sleep(300)
  }
  return false
}
async function grab(win, sel, waitMs = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    const el = await win.webContents.executeJavaScript(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText : null })()`,
    )
    if (el !== null && el !== '') return el
    await sleep(300)
  }
  return null
}

fs.mkdirSync(OUT, { recursive: true })
if (fs.existsSync(path.join(OUT, 'console-errors.txt'))) fs.rmSync(path.join(OUT, 'console-errors.txt'))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })

  await win.loadURL('http://localhost:5199/')   // NO ?fixture → real backend via proxy
  await sleep(3000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }
  out('--- connection badge / state ---')
  const badge = await grab(win, '.shell-badge')
  out(`badge: ${badge ?? '(none)'}`)

  out('--- session list (real backend) ---')
  const listOk = await waitForJS(win, `document.querySelectorAll('.sidebar-row').length >= 1`)
  out(`session rows present: ${listOk}`)
  const rowCount = await win.webContents.executeJavaScript(`document.querySelectorAll('.sidebar-row').length`)
  out(`row count: ${rowCount}`)
  const firstRows = await win.webContents.executeJavaScript(`[...document.querySelectorAll('.sidebar-row')].slice(0, 6).map(e => e.innerText.replace(/\\n/g,' ⏎ ')).join(' || ')`)
  out(`first rows: ${firstRows}`)

  // select first visible session (prefer one NOT re-running; picking any is read-only)
  out('--- select first session ---')
  const sel = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('.sidebar-row')].find(e => e.innerText.trim().length > 0); if (b) { b.click(); return true } return false })()`)
  out(`selected: ${sel}`)
  await sleep(2500)

  const chatNodes = await win.webContents.executeJavaScript(`document.querySelectorAll('.chat-node').length`)
  out(`chat nodes: ${chatNodes}`)
  const toolCards = await win.webContents.executeJavaScript(`document.querySelectorAll('.tool-card').length`)
  out(`tool cards: ${toolCards}`)
  const modelOptions = await grab(win, '.input-bar-model-select')
  out(`model selector: ${modelOptions === null ? 'missing' : modelOptions.replace(/\\n/g,' / ').slice(0,200)}`)
  const dock = await win.webContents.executeJavaScript(`({ interaction: !!document.querySelector('.interaction-dock'), queue: !!document.querySelector('.queue-dock') })`)
  out(`docks: interaction=${dock.interaction} queue=${dock.queue}`)

  // capture
  const body = await win.webContents.executeJavaScript(`document.body.innerText`)
  fs.writeFileSync(path.join(OUT, 'real-status.txt'), body)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'real-status.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'real-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('PROBE FAILED', err); app.exit(1) })
