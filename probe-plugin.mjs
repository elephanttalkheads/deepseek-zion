// Plugin runtime 底座 probe — validates client-half closure eval + guard +
// additive slot mounting end to end on the replica fixture page.
// Usage: npx electron probe-plugin.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-plugin-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function waitForJS(win, expr, waitMs = 10000) {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    if (await win.webContents.executeJavaScript(expr)) return true
    await sleep(300)
  }
  return false
}
async function clickText(win, selector, text) {
  return win.webContents.executeJavaScript(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
    const el = els.find(e => e.innerText && e.innerText.trim().includes(${JSON.stringify(text)}))
    if (el) { el.click(); return true }
    return false
  })()`)
}
async function clickFirst(win, selector) {
  return win.webContents.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (el) { el.click(); return true } return false })()`)
}

fs.mkdirSync(OUT, { recursive: true })
if (fs.existsSync(path.join(OUT, 'console-errors.txt'))) fs.rmSync(path.join(OUT, 'console-errors.txt'))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })

  await win.loadURL('http://localhost:5199/?fixture')
  await sleep(2500)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }

  out('--- plugin host present ---')
  await waitForJS(win, `!!document.querySelector('.plugin-host')`)
  out(`plugin-host: yes`)

  out('--- select a session (mounts InputBar where input.dock anchor lives) ---')
  await waitForJS(win, `document.querySelectorAll('.sidebar-row').length >= 1`)
  await clickFirst(win, '.sidebar-row')
  await sleep(1500)
  const inputBarMounted = await win.webContents.executeJavaScript(`!!document.querySelector('.input-bar')`)
  out(`input-bar mounted: ${inputBarMounted}`)

  out('--- load demo plugin ---')
  await clickText(win, '.plugin-host button', '载入演示')
  await sleep(1200)
  const hostState = await win.webContents.executeJavaScript(`document.querySelector('.plugin-host-state')?.innerText ?? ''`)
  out(`host state after load: ${hostState}`)

  out('--- additive slots rendered ---')
  const sidebarBadge = await waitForJS(win, `!!document.querySelector('.plugin-demo-badge')`)
  out(`sidebar.footer.action badge rendered: ${sidebarBadge}`)
  const inputDock = await waitForJS(win, `!!document.querySelector('.plugin-demo-dock')`)
  out(`conversation.input.dock rendered: ${inputDock}`)
  const badgetxt = await win.webContents.executeJavaScript(`document.querySelector('.plugin-demo-badge')?.innerText ?? ''`)
  const docktxt = await win.webContents.executeJavaScript(`document.querySelector('.plugin-demo-dock')?.innerText ?? ''`)
  out(`badge text: ${badgetxt}`)
  out(`dock text: ${docktxt}`)

  out('--- load trap probe (2nd additive entry shares dock) ---')
  await clickText(win, '.plugin-host button', '禁区探针')
  await sleep(1000)
  const dockCount = await win.webContents.executeJavaScript(`document.querySelectorAll('.plugin-demo-dock').length`)
  out(`dock entries after 2 plugins: ${dockCount}`)
  const trapsRendered = await win.webContents.executeJavaScript(`!!document.querySelector('.plugin-demo-dock--traps')`)
  out(`traps entry rendered: ${trapsRendered}`)

  out('--- unload all ---')
  await win.webContents.executeJavaScript(`(() => { const btns = [...document.querySelectorAll('.plugin-host button')]; const b = btns.find(e => e.innerText.trim() === '卸载'); if (b) { b.click(); return true } return false })()`)
  await sleep(1000)
  const afterUnload = await win.webContents.executeJavaScript(`document.querySelectorAll('.plugin-demo-dock, .plugin-demo-badge').length`)
  out(`additive entries after unload: ${afterUnload}`)
  const hostStateAfter = await win.webContents.executeJavaScript(`document.querySelector('.plugin-host-state')?.innerText ?? ''`)
  out(`host state after unload: ${hostStateAfter}`)

  // screenshot
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'plugin-status.png'), shot.toPNG())
  const body = await win.webContents.executeJavaScript(`document.body.innerText`)
  fs.writeFileSync(path.join(OUT, 'plugin-status.txt'), body)
  fs.writeFileSync(path.join(OUT, 'console-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
}).catch(err => { console.error('PROBE FAILED', err); app.exit(1) })
