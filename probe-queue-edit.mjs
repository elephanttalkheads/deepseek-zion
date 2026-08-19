// P3 队列行内编辑探针(fixture)。选中运行中的 fx-alpha → 排队一条提示 →
// 行内编辑(改文本)→ 保存 → 行预览更新(fixture updateQueue edit 往返)。
// 用法:
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-queue-edit.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-queue-edit-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/?fixture&fixtureQueue=1'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 10000, every = 400) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL(URL)
  await waitFor(win, `document.querySelectorAll('.sidebar-item').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  // 选 fx-alpha(第一行,运行中)→ 排队一条提示
  await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
  await sleep(1500)
  const typed = await js(win, `(() => {
    const ta = document.querySelector('.input-bar-textarea')
    if (!ta) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, 'queue-edit-probe-原文')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(300)
  const sent = await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (!b) return false; b.click(); return true })()`)
  const queued = await waitFor(win, `[...document.querySelectorAll('.queue-row')].some(r => (r.innerText ?? '').includes('queue-edit-probe-原文'))`, 10000)
  mark('q1', typed && sent && queued, 'Q1 运行中会话排队提示出现(队列行)', `sent=${sent}`)

  // 行内编辑:点「编辑」→ 输入框 → 改文本 → 保存 → 预览更新
  const editBtn = await js(win, `(() => {
    const row = [...document.querySelectorAll('.queue-row')].find(r => (r.innerText ?? '').includes('queue-edit-probe-原文'))
    const b = [...(row?.querySelectorAll('button') ?? [])].find(x => (x.innerText ?? '').trim() === '编辑')
    if (!b) return false
    b.click(); return true
  })()`)
  const inputShown = await waitFor(win, `!!document.querySelector('.queue-edit-input')`, 6000)
  const inputValue = await js(win, `document.querySelector('.queue-edit-input')?.value ?? ''`)
  const retyped = await js(win, `(() => {
    const input = document.querySelector('.queue-edit-input')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, 'queue-edit-probe-已修改')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(300)
  const saved = await js(win, `(() => {
    const row = document.querySelector('.queue-row')
    const b = [...(row?.querySelectorAll('button') ?? [])].find(x => (x.innerText ?? '').trim() === '保存')
    if (!b) return false
    b.click(); return true
  })()`)
  const previewUpdated = await waitFor(win, `[...document.querySelectorAll('.queue-row')].some(r => (r.innerText ?? '').includes('queue-edit-probe-已修改'))`, 8000)
  mark('q2', editBtn && inputShown && inputValue.includes('queue-edit-probe-原文') && retyped && saved && previewUpdated,
    'Q2 行内编辑 → 保存 → 预览更新(updateQueue edit 往返)', `input=${JSON.stringify(inputValue)}`)

  mark('q3', errors.length === 0, 'Q3 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'queue-edit.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'queue-edit.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'queue-edit-errors.txt'), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== QueueEdit 探针: ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('QUEUE-EDIT PROBE FAILED', err); app.exit(1) })
