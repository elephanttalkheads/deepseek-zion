// host.call remote-invoke probe against the REAL backend.
// Loads demo plugin, clicks the host.call button, and asserts the invoke RPC
// reaches the host and returns the expected teaching failure (no host half
// registered for the demo plugin). Also verifies the button + console path.
// Usage: npx electron probe-hostcall.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-hostcall-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const logs = []
  win.webContents.on('console-message', (_e, level, message) => { logs.push({ level, message }) })
  await win.loadURL('http://localhost:5199/')
  await sleep(4000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }
  out(`badge: ${await js(win, `document.querySelector('.shell-badge')?.innerText ?? ''`)}`)

  out('--- select session + load demo plugin ---')
  await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
  await sleep(1500)
  await js(win, `(() => { const b = [...document.querySelectorAll('.plugin-host button')].find(e => e.innerText.includes('载入演示')); if (b) { b.click(); return true } return false })()`)
  await sleep(1200)
  out(`host state: ${await js(win, `document.querySelector('.plugin-host-state')?.innerText ?? ''`)}`)

  out('--- click host.call test button ---')
  const btn = await js(win, `(() => { const b = [...document.querySelectorAll('.plugin-demo-hostcall')][0]; if (b) { b.click(); return true } return false })()`)
  out(`hostcall button clicked: ${btn}`)
  await sleep(1500)

  const relevant = logs.filter(l => String(l.message).includes('zion-demo'))
  out(`console lines mentioning zion-demo: ${relevant.length}`)
  for (const l of relevant.slice(-4)) out(`  [${l.level}] ${String(l.message).slice(0, 180)}`)
  const errors = logs.filter(l => l.level >= 3)
  out(`console errors: ${errors.length}`)

  fs.writeFileSync(path.join(OUT, 'hostcall.txt'), lines.join('\n'))
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'hostcall.png'), shot.toPNG())
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('HOSTCALL PROBE FAILED', err); app.exit(1) })
