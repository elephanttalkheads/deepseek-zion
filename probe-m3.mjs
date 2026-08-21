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

  // 6. model selector present + switch model then report via prompt
  out('--- model selector ---')
  const modelSelect = await grab(win, '.input-bar-model-select')
  out(modelSelect === null ? 'MISSING model selector' : `model options: ${modelSelect.replace(/[\n]+/g, ' / ').slice(0, 300)}`)
  // switch to OpenAI GPT-5
  await win.webContents.executeJavaScript(`(() => { const s = document.querySelector('.input-bar-model-select'); if (!s) return false; const opt = [...s.options].find(o => o.value === 'openai/gpt-5'); if (!opt) return false; s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
  await sleep(800)
  const selValue = await win.webContents.executeJavaScript(`document.querySelector('.input-bar-model-select')?.value ?? 'none'`)
  out(`selector value after change: ${selValue}`)
  // send "report model" to see the fixture echo the selection back
  out(`running now: ${await win.webContents.executeJavaScript(`!!document.querySelector('.input-bar-stop')`)}`)
  // fx-alpha is resident-running; stop once so the composer exposes 发送
  if (await win.webContents.executeJavaScript(`!!document.querySelector('.input-bar-stop')`)) {
    await clickFirst(win, '.input-bar-stop')
    await sleep(1200)
  }
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
