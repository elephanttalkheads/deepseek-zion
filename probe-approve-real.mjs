// approve 全链路真后端 probe:
//  1. create a NEW session
//  2. prompt the real agent to cordis_define + cordis_run a minimal client-only
//     plugin (registers sidebar.footer.action) — this mints a real run request
//  3. replica receives cordis/request-run -> approval card appears
//  4. click 允许 -> runHostHalf + getClientCode + client load -> additive slot renders
//  5. verify, then tentative undefine via agent (cleanup) is out of scope here —
//     the test leaves the plugin defined; a following turn can undefine it.
// NOTE: runs a real agent turn and registers a real plugin on 3080.
// Usage: npx electron probe-approve-real.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-approve-real-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 15000, every = 700) => {
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
  return await res.json()
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

  out('--- create new session ---')
  const createRes = await WIRE(win, 'session.create', {})
  const sessionId = createRes.result?.ok === true ? createRes.result.value.sessionId : null
  out(`session: ${sessionId ?? JSON.stringify(createRes.result)}`)
  if (sessionId === null) { app.exit(1); return }

  const PROMPT = '用 cordis_define 工具定义一个名为 zion-approve-demo 的最小插件(只写 client 半:返回一个 apply(ctx) 的插件,在 apply 里注册 sidebar.footer.action 一个「审批成功」badge 文本)。'
    + '然后立刻用 cordis_run 运行它(用默认 mode)。随后停止——不要 undefine。完成后只回复「插件已定义并运行」。'

  out('--- prompt agent to cordis_define + cordis_run ---')
  const p1 = await WIRE(win, 'session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: PROMPT }], clientTimeZone: 'UTC' })
  out(`prompt ok: ${p1.result?.ok}`)

  out('--- wait for approval card (cordis/request-run forwarded) ---')
  const card = await waitFor(win, `!!document.querySelector('.plugin-approval')`, 45000, 1000)
  out(`approval card appeared: ${card}`)
  const cardText = await js(win, `document.querySelector('.plugin-approval')?.innerText ?? ''`)
  out(`approval card: ${cardText.replace(/\n/g, ' | ')}`)

  out('--- click 允许 (approve) ---')
  const approved = await js(win, `(() => { const b = [...document.querySelectorAll('.plugin-approval button')].find(x => x.innerText === '允许'); if (b) { b.click(); return true } return false })()`)
  out(`approve clicked: ${approved}`)
  await sleep(2000)

  out('--- verify client half loaded + additive slot rendered ---')
  const hostState = await js(win, `document.querySelector('.plugin-host-state')?.innerText ?? ''`)
  out(`plugin host state: ${hostState}`)
  const badge = await js(win, `[...document.querySelectorAll('.plugin-slot-entry')].some(e => e.innerText.includes('审批成功'))`)
  out(`additive slot rendered from plugin: ${badge}`)
  const anyPlugin = await js(win, `document.querySelectorAll('.plugin-slot-entry').length`)
  out(`total plugin slot entries: ${anyPlugin}`)

  fs.writeFileSync(path.join(OUT, 'approve-real.txt'), lines.join('\n'))
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'approve-real.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'approve-real-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('APPROVE REAL PROBE FAILED', err); app.exit(1) })
