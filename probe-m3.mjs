// M3 probe — verify InteractionDock (approval + question) and model selector
// end to end against the replica on the local vite preview (?fixture).
// Usage: npx electron probe-m3.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-m3-out')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function grab(win, sel, waitMs = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    const found = await win.webContents.executeJavaScript(
      `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? el.innerText : null })()`,
    )
    if (found !== null && found !== '') return found
    await sleep(250)
  }
  return null
}

async function waitForJS(win, expr, waitMs = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    if (await win.webContents.executeJavaScript(expr)) return true
    await sleep(250)
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
  return win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (el) { el.click(); return true }
    return false
  })()`)
}

function dump(win, label) {
  return win.webContents.executeJavaScript(
    `(() => { const t = document.body.innerText; return t })()`,
  ).catch(() => '<dump-error>')
}
fs.mkdirSync(OUT, { recursive: true })
if (fs.existsSync(path.join(OUT, 'console-errors.txt'))) fs.rmSync(path.join(OUT, 'console-errors.txt'))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440, height: 900,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message)
  })

  await win.loadURL('http://localhost:5199/?fixture')
  await sleep(2500)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }

  // 1. select fx-alpha session
  out('--- select fx-alpha ---')
  await waitForJS(win, `[...document.querySelectorAll('.sidebar-row')].some(e => e.innerText.includes('Fixture 历史会话'))`)
  await clickText(win, '.sidebar-row', 'Fixture 历史会话')
  await sleep(1800)

  // 2. composer takeover: fx-alpha 常驻审批 → ApprovalPanel(官方接管面,
  //    取代早期 M3 InteractionDock 卡片;官方语义:挂起交互接管 composer,
  //    聊天流内不再渲染重复等待卡)。
  out('--- approval takeover ---')
  await waitForJS(win, `!!document.querySelector('[data-approval-key]')`)
  const approvalText = await grab(win, '[data-approval-key]')
  out(approvalText === null ? 'MISSING approval panel' : `approval: ${approvalText.replace(/\n/g, ' | ')}`)

  // 2b. screenshot the pending panel BEFORE answering
  const shotPending = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'm3-interaction-cards.png'), shotPending.toPNG())

  // 3. 允许一次 → 审批结算 → QuestionComposer 接管
  out('--- allow-once ---')
  const clicked = await clickText(win, '[data-approval-key] button', '允许一次')
  out(`clicked allow: ${clicked}`)
  await waitForJS(win, `!!document.querySelector('[data-question-key]')`)
  const afterApproval = await win.webContents.executeJavaScript(`document.querySelector('[data-approval-key]') === null`)
  out(`approval gone after response: ${afterApproval}`)

  // 4. 三问:单选推进 Q1→Q2→Q3(多选勾选)后提交
  out('--- answer question ---')
  await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-question-key] [role="radio"]')][0]; if (!b) return false; b.click(); return true })()`)
  await waitForJS(win, `(document.querySelector('[data-question-key] h2')?.innerText ?? '').includes('工作方式')`)
  await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-question-key] [role="radio"]')][0]; if (!b) return false; b.click(); return true })()`)
  await waitForJS(win, `(document.querySelector('[data-question-key] h2')?.innerText ?? '').includes('面试信号')`)
  await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-question-key] [role="checkbox"]')][0]; if (!b) return false; b.click(); return true })()`)
  await sleep(250)
  const submitEnabled = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-question-key] button')].find(e => e.innerText.includes('提交')); return b ? !b.disabled : null })()`)
  out(`submit enabled after all 3 answered: ${submitEnabled}`)
  if (submitEnabled) {
    await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('[data-question-key] button')].find(e => e.innerText.includes('提交')); if (b) b.click(); return true })()`)
    await waitForJS(win, `!!document.querySelector('.input-bar-textarea')`)
  }
  const afterQuestion = await win.webContents.executeJavaScript(`document.querySelector('[data-question-key]') === null`)
  out(`question gone after response: ${afterQuestion}`)

  // 6. model selector(两级菜单 ModelSelect):选 GPT-5 → 发「report model」看 fixture 回显
  // (2026-08-21 重写:旧断言的扁平 <select class="input-bar-model-select"> 已随
  // 官方两级菜单落地退役;菜单交互口径与 probe-model.mjs 一致)
  out('--- model selector ---')
  // fx-alpha is resident-running;选择器运行中锁定,先停一次(同时让 composer 露出发送)
  out(`running now: ${await win.webContents.executeJavaScript(`!!document.querySelector('.input-bar-stop')`)}`)
  if (await win.webContents.executeJavaScript(`!!document.querySelector('.input-bar-stop')`)) {
    await clickFirst(win, '.input-bar-stop')
    await sleep(1200)
  }
  const seatSel = `'.input-bar-model'`
  const triggerOk = await waitForJS(win, `(() => { const b = document.querySelector(${seatSel} + ' button'); return !!b && !b.disabled && (b.innerText || '').trim() !== '' })()`)
  const triggerBefore = await win.webContents.executeJavaScript(`document.querySelector(${seatSel} + ' button')?.innerText ?? ''`)
  out(triggerOk ? `model trigger: ${JSON.stringify(triggerBefore)}` : 'MISSING model selector')
  // 打开根菜单 → 钻入「模型」→ 选 GPT-5
  await win.webContents.executeJavaScript(`document.querySelector(${seatSel} + ' button')?.click()`)
  await sleep(700)
  await waitForJS(win, `(() => { const c = document.querySelector(${seatSel}); const b = c && [...c.querySelectorAll('button')].find(x => (x.innerText || '').trim().startsWith('模型')); if (b) { b.click(); return true } return false })()`)
  await sleep(700)
  const paneButtons = await win.webContents.executeJavaScript(`[...document.querySelectorAll(${seatSel} + ' button')].map(b => (b.innerText || '').trim()).filter(Boolean)`)
  out(`model pane buttons: ${JSON.stringify(paneButtons)}`)
  const picked = await win.webContents.executeJavaScript(`(() => { const c = document.querySelector(${seatSel}); const b = [...(c?.querySelectorAll('button') ?? [])].find(x => (x.innerText || '').includes('GPT-5')); if (b) { b.click(); return true } return false })()`)
  await sleep(900)
  const triggerAfter = await win.webContents.executeJavaScript(`document.querySelector(${seatSel} + ' button')?.innerText ?? ''`)
  out(`picked GPT-5: ${picked}; trigger after: ${JSON.stringify(triggerAfter)}`)
  // send "report model" to see the fixture echo the selection back
  await win.webContents.executeJavaScript(`(() => { const ta = document.querySelector('.input-bar-textarea'); if (!ta) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set; setter.call(ta, 'report model'); ta.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await sleep(300)
  const draftState = await win.webContents.executeJavaScript(`(() => { const ta = document.querySelector('.input-bar-textarea'); const btn = [...document.querySelectorAll('.input-bar-send')][0]; return JSON.stringify({ value: ta?.value ?? null, btnDisabled: btn ? btn.disabled : null, btnExists: !!btn }) })()`)
  out(`draft/button state: ${draftState}`)
  await clickFirst(win, '.input-bar-send')
  await sleep(4000)
  const bodyText = await win.webContents.executeJavaScript(`document.body.innerText`)
  const sent = bodyText.includes('当前模型')
  out(`fixture echoed current model after select + prompt: ${sent}`)
  out(`model line: ${(bodyText.match(/当前模型[^\n]*/g) ?? ['<none>']).join(' | ')}`)
  out(`echo present: ${bodyText.includes('回声：report model')}`)
  out(`tail200: ${bodyText.slice(-200).replace(/\n/g, '⏎')}`)

  // screenshot + text
  const body = await dump(win)
  fs.writeFileSync(path.join(OUT, 'm3-status.txt'), body)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'm3-status.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'console-errors.txt'), errors.join('\n'))

  out('--- done ---')
  app.quit()
}).catch(err => { console.error('PROBE FAILED', err); app.exit(1) })
