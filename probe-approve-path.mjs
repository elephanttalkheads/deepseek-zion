// approve full-chain probe against the REAL backend (no real plugin defined):
// injecting a cordis/request-run and clicking 允许 exercises the REAL
// orchestration path: runHostHalf -> host answers plugin-not-running (authoritative)
// -> resolveRequestRun(rejected) -> lastRunError surfaces in the host UI.
// This is the honest full-chain behavior when no dynamic plugin exists on 3080.
// Usage: npx electron probe-approve-path.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-approve-path-out')
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

  out('--- inject request-run (wire shape) + click 允许 ---')
  await js(win, `window.__zionProbeHandleRemoteEvent('cordis/request-run', [{
    requestId: 'req-path-1', agentId: 'agent-x', pluginId: 'plug-path',
    packageId: 'pkg-1', mode: 'run', name: 'path-plugin', purpose: 'full-chain probe',
    requiresApproval: true,
  }])`)
  await sleep(500)
  const card = await js(win, `document.querySelector('.plugin-approval')?.innerText ?? ''`)
  out(`approval card: ${card.replace(/\n/g, ' | ')}`)
  await js(win, `document.querySelector('.plugin-approval button')?.click()`)
  await sleep(1800)

  const hostState = await js(win, `document.querySelector('.plugin-host-state')?.innerText ?? ''`)
  out(`host state after approve: ${hostState}`)
  const cardAfter = await js(win, `document.querySelectorAll('.plugin-approval').length`)
  out(`approval cards after approve: ${cardAfter} (0 = request settled)`)
  const errLines = logs.filter(l => String(l.message).includes('cordis-run') || String(l.message).includes('plugin-not-running'))
  out(`diagnostic console lines: ${errLines.length}`)
  for (const l of errLines.slice(-3)) out(`  ${String(l.message).slice(0, 160)}`)
  const hardErrors = logs.filter(l => l.level >= 3)
  out(`console errors: ${hardErrors.length}`)

  // verify wire resolveRequestRun accepted the rejection (host acks)
  const ack = await js(win, `(async () => {
    const rpcId = crypto.randomUUID()
    const res = await fetch('/api/dynamicCordisRunner/resolveRequestRun', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'dynamicCordisRunner/resolveRequestRun',
        payload: { args: { requestId: 'req-path-1', resolution: { ok: false, reason: 'rejected' } } } }),
    })
    const full = await res.json()
    return JSON.stringify(full.result ?? full)
  })()`)
  out(`resolveRequestRun ack over wire: ${ack}`)

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'approve-path.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'approve-path.txt'), lines.join('\n'))
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('APPROVE PATH PROBE FAILED', err); app.exit(1) })
