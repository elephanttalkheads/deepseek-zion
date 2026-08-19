// Fixture queue-scenario probe: verifies session.updateQueue end to end under
// ?fixture&fixtureQueue=1 — an accepted prompt parks in the transient
// session/queue inbox (QueueDock row), and 移除/插队 mutate it via
// session.updateQueue (remove / steer).
// Usage: npx electron probe-functional-queue.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-functional-queue-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function waitFor(win, expr, waitMs = 12000, every = 400) {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v
    try { v = await win.webContents.executeJavaScript(expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const typeInto = (win, selector, value) => js(win, `(() => {
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) return false
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`)

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })

  await win.loadURL('http://localhost:5199/?fixture&fixtureQueue=1')
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const results = {}
  const details = {}
  const check = async (id, expr, label) => {
    const ok = await waitFor(win, expr, 12000)
    results[id] = ok
    details[id] = `${label}: ${ok ? 'PASS' : 'FAIL'}`
    console.log(`${ok ? '✅' : '❌'} ${label}`)
  }

  // Fresh blank session (blank sessions hide in the sidebar; InputBar mounting
  // proves selection).  Prompt #1 lands in the transient queue (fixtureQueue).
  await js(win, `(() => { const b = document.querySelector('.shell-new'); if (b) b.click(); return !!b })()`)
  await check('01', `!!document.querySelector('.input-bar')`, '01 新会话创建并被选中')
  await typeInto(win, '.input-bar-textarea', '排队验收消息一')
  await sleep(150)
  await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (b) b.click(); return !!b })()`)
  await check('02', `!!document.querySelector('.queue-row[data-placement="queued"]')`, '02 排队消息出现在 QueueDock(queued)')
  const actions = await js(win, `[...document.querySelectorAll('.queue-row[data-placement="queued"] .queue-action')].map(b => b.innerText).join(',')`)
  details['03'] = `queued 行动作 = ${actions}`
  await check('03', `${JSON.stringify(actions)}.includes('移除') && ${JSON.stringify(actions)}.includes('插队')`, '03 移除/插队按钮存在')

  // remove via updateQueue
  await js(win, `(() => { const b = [...document.querySelectorAll('.queue-row[data-placement="queued"] .queue-action')].find(x => x.innerText === '移除'); if (b) b.click(); return !!b })()`)
  await check('04', `!document.querySelector('.queue-row[data-placement="queued"]')`, '04 updateQueue(remove): 排队行消失')
  const errStrip = await js(win, `document.querySelector('.input-bar-error')?.innerText ?? ''`)
  details['05'] = `移除后错误条 = ${errStrip || '(空)'}`
  await check('05', `${JSON.stringify(errStrip)} === '' || ${JSON.stringify(errStrip)} === null`, '05 移除无错误')

  // prompt again, then steer
  await typeInto(win, '.input-bar-textarea', '排队验收消息二')
  await sleep(150)
  await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (b) b.click(); return !!b })()`)
  await check('06', `!!document.querySelector('.queue-row[data-placement="queued"]')`, '06 第二条排队消息出现')
  await js(win, `(() => { const b = [...document.querySelectorAll('.queue-row[data-placement="queued"] .queue-action')].find(x => x.innerText === '插队'); if (b) b.click(); return !!b })()`)
  await check('07', `!document.querySelector('.queue-row[data-placement="queued"]')`, '07 updateQueue(steer): queued 行消失(转为 steering/durable)')
  const errStrip2 = await js(win, `document.querySelector('.input-bar-error')?.innerText ?? ''`)
  details['08'] = `插队后错误条 = ${errStrip2 || '(空)'}`
  await check('08', `${JSON.stringify(errStrip2)} === '' || ${JSON.stringify(errStrip2)} === null`, '08 插队无错误')

  results['09'] = errors.length === 0
  details['09'] = errors.length === 0 ? '控制台零错误: PASS' : `控制台错误: ${errors.length}`
  console.log(`${errors.length === 0 ? '✅' : '❌'} 09 控制台错误(${errors.length})`)

  fs.writeFileSync(path.join(OUT, 'functional-queue.json'), JSON.stringify({ results, details, errors }, null, 2))
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'functional-queue.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'functional-queue-errors.txt'), errors.join('\n'))

  const pass = Object.values(results).filter(Boolean).length
  const total = Object.values(results).length
  console.log(`\n== 队列场景 probe: ${pass}/${total} pass ==`)
  app.quit()
}).catch(err => { console.error('FUNCTIONAL QUEUE PROBE FAILED', err); app.exit(1) })
