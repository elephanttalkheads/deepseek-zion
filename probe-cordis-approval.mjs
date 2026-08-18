// cordis_run approval-card end-to-end probe: inject a synthetic
// host/remote-event (cordis/request-run) exactly as the wire delivers it and
// verify the orchestrator renders an approval card with 允许/拒绝 actions.
// Decline path: click 拒绝 -> card clears. Usage: npx electron probe-cordis-approval.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-cordis-approval-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/')
  await sleep(3500)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }

  out('--- inject synthetic cordis/request-run event (wire shape) ---')
  const delivered = await js(win, `(async () => {
    if (typeof window.__zionProbeHandleRemoteEvent === 'function') {
      window.__zionProbeHandleRemoteEvent('cordis/request-run', [{
        requestId: 'req-probe-1', agentId: 'agent-x', pluginId: 'plug-probe',
        packageId: 'pkg-1', mode: 'run', name: 'probe-plugin', purpose: 'probe purpose',
        requiresApproval: true,
      }])
      return true
    }
    return false
  })()`)
  out(`direct pump available: ${delivered}`)
  await sleep(500)

  out('--- approval card rendered ---')
  const card = await js(win, `(() => {
    const c = document.querySelector('.plugin-approval')
    return c ? c.innerText.replace(/\\n/g, ' | ') : null
  })()`)
  out(`approval card: ${card ?? 'MISSING'}`)
  const actions = await js(win, `[...document.querySelectorAll('.plugin-approval button')].map(b => b.innerText).join(',')`)
  out(`approval actions: ${actions}`)

  out('--- decline path (拒绝) clears the card ---')
  const declined = await js(win, `(() => { const b = [...document.querySelectorAll('.plugin-approval button')].find(x => x.innerText === '拒绝'); if (b) { b.click(); return true } return false })()`)
  out(`decline clicked: ${declined}`)
  await sleep(500)
  const afterDecline = await js(win, `document.querySelectorAll('.plugin-approval').length`)
  out(`approval cards after decline: ${afterDecline}`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'cordis-approval.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'cordis-approval.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'cordis-approval-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('APPROVAL PROBE FAILED', err); app.exit(1) })
