// Official dsh web (3080) first-screen structural probe for parity comparison.
// Loads the REAL backend without ?fixture, grabs sidebar rows / workspace /
// badge / chat nodes / tool cards / model selector as TEXT. Read-only.
// Usage: npx electron probe-official-real.mjs   (writes zion-verify)
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-official-real-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://127.0.0.1:3080/')
  await sleep(5000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }
  out('--- official 3080 real backend ---')
  const body = await win.webContents.executeJavaScript(`document.body.innerText`)
  const rows = body.split('\n')
  out(`body lines: ${rows.length}`)

  // generic structural census using element classes the official UI exposes
  const census = await win.webContents.executeJavaScript(`(() => {
    const cc = sel => document.querySelectorAll(sel).length
    return JSON.stringify({
      buttons: cc('button'), sidebarItems: cc('[class*="sidebar"]'), chatNodes: cc('[class*="node"]'),
      inputBar: cc('textarea'), cards: cc('[class*="card"]'),
    })
  })()`)
  out(`census: ${census}`)

  fs.writeFileSync(path.join(OUT, 'official-real.txt'), body)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'official-real.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'official-real-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('PROBE FAILED', err); app.exit(1) })
