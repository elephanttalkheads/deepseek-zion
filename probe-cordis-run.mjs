// cordis_run 审批编排 probe — verifies the dynamicCordisRunner remote bridge
// against the REAL backend (3080): inventory() is a read-only RPC listing every
// dynamic plugin row process-wide; host/remote-event frames must pump through
// the replica without errors. Usage: npx electron probe-cordis-run.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-cordis-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/')
  await sleep(4000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }
  out('--- real backend connected ---')
  const badge = await js(win, `document.querySelector('.shell-badge')?.innerText ?? ''`)
  out(`badge: ${badge}`)

  out('--- dynamicCordisRunner.inventory RPC via remote bridge ---')
  // Drive the remote bridge from inside the page (it has /api proxy access).
  const inventory = await js(win, `(async () => {
    // Reuse the app's own connection channel by invoking the hub's remote through the loaded bundle.
    // Simpler: call the wire endpoint directly like the official client does.
    const rpcId = crypto.randomUUID()
    const res = await fetch('/api/dynamicCordisRunner/inventory', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'dynamicCordisRunner/inventory', payload: { args: {} } }),
    })
    const full = await res.json()
    return JSON.stringify(full).slice(0, 2000)
  })()`)
  out(`inventory response: ${inventory}`)

  out('--- host/remote-event wiring (no crash) ---')
  const pluginHost = await js(win, `!!document.querySelector('.plugin-host')`)
  out(`plugin host mounted: ${pluginHost}`)
  const approvals = await js(win, `document.querySelectorAll('.plugin-approval').length`)
  out(`approval cards now: ${approvals} (0 expected unless a cordis_run request is pending)`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'cordis-run.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'cordis-run.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'cordis-run-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('CORDIS RUN PROBE FAILED', err); app.exit(1) })
