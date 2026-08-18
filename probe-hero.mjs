// Replica hero-state screenshot (no session selected) against real backend,
// for a fair hero-vs-hero pixel comparison with the official page.
// Usage: npx electron probe-hero.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-hero-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/')
  await sleep(6000) // let it connect + settle (no session clicked => hero)
  // ensure no session got auto-selected
  const body = await win.webContents.executeJavaScript(`document.body.innerText`)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'replica-hero.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'replica-hero.txt'), body)
  fs.writeFileSync(path.join(OUT, 'replica-hero-errors.txt'), errors.join('\n'))
  console.log(`errors: ${errors.length}; body lines: ${body.split('\\n').length}`)
  app.quit()
}).catch(err => { console.error('HERO FAILED', err); app.exit(1) })
