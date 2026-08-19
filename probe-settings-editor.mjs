// Settings Provider 编辑面板探针(真后端) — 打开 设置→模型→编辑 opencode-go:
//   派生 apiKeyEnv、凭证读取状态(已配置)、模型目录渲染、添加 scratch 模型→写库、
//   移除 scratch 模型→还原、探活(discoverModels 注册表路径)、全程零错误。
// 用法: npx electron probe-settings-editor.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-settings-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 10000, every = 500) => {
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
  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-row, .sidebar-hint').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  // 打开设置 → 模型
  await waitFor(win, `(() => { const b = document.querySelector('.sidebar-settings-trigger'); if (b) { b.click(); return true } return false })()`, 8000)
  await waitFor(win, `!!document.querySelector('.settings-shell:not([hidden])')`, 8000)
  await js(win, `[...document.querySelectorAll('.settings-nav-item')].find(x => x.innerText === '模型').click()`)
  await waitFor(win, `document.querySelectorAll('.settings-provider-row').length >= 1`, 8000)

  // 编辑 deepseek-official(llm-deepseek,根级 models 数组配置)
  const toEdit = await waitFor(win, `(() => {
    const row = [...document.querySelectorAll('.settings-provider-row')].find(r => r.innerText.includes('deepseek-official'))
    const b = row?.querySelector('.settings-provider-edit')
    if (b) { b.click(); return true } return false
  })()`, 8000)
  mark('e1', toEdit, 'E1 点「编辑」打开 deepseek-official 编辑面板')
  const back = await waitFor(win, `!!document.querySelector('.settings-back')`, 8000)
  mark('e2', back, 'E2 编辑面板含「← 返回」')

  // API key 槽
  const keyInput = await waitFor(win, `!!document.querySelector('.settings-editor-block input[type="password"]')`, 8000)
  const keyPlaceholder = await js(win, `document.querySelector('.settings-editor-block input[type="password"]')?.placeholder ?? ''`)
  mark('e3', keyInput, 'E3 API key 密码输入框存在', `placeholder=${keyPlaceholder.slice(0, 60)}`)
  mark('e4', keyPlaceholder.includes('已配置') || keyPlaceholder.includes('API key'), 'E4 凭证引用状态已读取(configured 或可输)', `含"已配置"=${keyPlaceholder.includes('已配置')}`)

  // 模型目录:应含 deepseek-v4-flash
  const modelsLoaded = await waitFor(win, `document.querySelectorAll('.settings-model-row').length >= 1`, 8000)
  const modelTexts = await js(win, `[...document.querySelectorAll('.settings-model-row')].map(r => r.innerText.split('移除')[0].trim())`)
  out(`models: ${JSON.stringify(modelTexts)}`)
  mark('e5', modelsLoaded && modelTexts.some(t => t.includes('deepseek-v4-flash')), 'E5 模型目录渲染并含 deepseek-v4-flash', `count=${modelTexts.length}`)

  // 添加 scratch 模型 → 写库 → 出现
  const scratch = `zion-probe-${Date.now()}`
  const added = await js(win, `(() => {
    const input = [...document.querySelectorAll('.settings-input')].find(i => (i.placeholder || '').includes('模型 id'))
    const btn = [...document.querySelectorAll('.settings-editor-block .settings-btn')].find(b => b.innerText === '添加')
    if (!input || !btn) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(scratch)}); input.dispatchEvent(new Event('input', { bubbles: true }))
    btn.click(); return true
  })()`)
  mark('e6', added, 'E6 输入 scratch 模型并点添加')
  const scratchShown = await waitFor(win, `[...document.querySelectorAll('.settings-model-row')].some(r => r.innerText.includes(${JSON.stringify(scratch)}))`, 8000)
  mark('e7', scratchShown, 'E7 scratch 模型出现在目录(settings.mutate 写库生效)', scratch)

  // 移除 scratch → 还原
  const removed = await js(win, `(() => {
    const row = [...document.querySelectorAll('.settings-model-row')].find(r => r.innerText.includes(${JSON.stringify(scratch)}))
    const b = row?.querySelector('button')
    if (b) { b.click(); return true } return false
  })()`)
  await sleep(1200)
  const scratchGone = await js(win, `![...document.querySelectorAll('.settings-model-row')].some(r => r.innerText.includes(${JSON.stringify(scratch)}))`)
  mark('e8', removed && scratchGone, 'E8 移除 scratch 模型后目录还原', scratch)

  // 探活
  const discoverClicked = await js(win, `(() => {
    const b = [...document.querySelectorAll('.settings-editor-block .settings-btn')].find(x => x.innerText === '探测')
    if (b) { b.click(); return true } return false
  })()`)
  const candidates = await waitFor(win, `document.querySelectorAll('.settings-model-row .settings-btn-tiny').length >= 1`, 8000)
  const candidateCount = await js(win, `[...document.querySelectorAll('.settings-editor-block')].at(-1)?.querySelectorAll('.settings-model-row').length ?? 0`)
  mark('e9', discoverClicked && candidates, 'E9 探活(discoverModels)返回候选', `count=${candidateCount}`)

  // 关闭
  await js(win, `document.querySelector('.settings-close')?.click()`)
  await sleep(400)
  mark('e10', errors.length === 0, 'E10 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'settings-editor.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'settings-editor.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'settings-editor-errors.txt'), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== Settings Provider 编辑探针: ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('SETTINGS EDITOR PROBE FAILED', err); app.exit(1) })
