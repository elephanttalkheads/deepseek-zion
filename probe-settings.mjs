// SettingsShell 探针 — 打开设置(真后端 + fixture),验证壳/导航/通用区(外观三 cube、
// 语言下拉,真后端 settings.mutate 读写回)、模型 Provider 目录、UI 不炸。
// 真后端用例结束后把 ui-theme/locale 还原。用法:
//   npx electron probe-settings.mjs                # 真后端 http://localhost:5199/
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-settings.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-settings-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/'
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
const tag = URL.includes('fixture') ? 'fixture' : 'real'

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL(URL)
  await waitFor(win, `document.querySelectorAll('.sidebar-row, .sidebar-hint').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out(`mode: ${tag}  badge: ${await js(win, `document.querySelector('.shell-badge')?.innerText ?? ''`)}`)

  // 打开设置
  const opened = await waitFor(win, `(() => {
    const b = document.querySelector('.sidebar-settings-trigger')
    if (!b) return false
    b.click(); return true
  })()`, 8000)
  mark('s1', opened, 'S1 侧栏页脚设置触发按钮可点并打开')
  const shell = await waitFor(win, `!!document.querySelector('.settings-shell:not([hidden])')`, 8000)
  mark('s2', shell, 'S2 SettingsShell 挂载(遮罩+面板)')
  const nav = await js(win, `[...document.querySelectorAll('.settings-nav-item')].map(b => b.innerText)`)
  out(`nav: ${JSON.stringify(nav)}`)
  mark('s3', ['通用', '模型', '插件', '插件清单'].every(x => nav.includes(x)), 'S3 左侧导航含 通用/模型/插件/插件清单', JSON.stringify(nav))

  // 通用:外观三 cube
  const cubes = await js(win, `[...document.querySelectorAll('.settings-cube')].map(b => ({ t: b.innerText, a: !!b.getAttribute('data-active') }))`)
  out(`appearance cubes: ${JSON.stringify(cubes)}`)
  mark('s4', cubes.length === 3, 'S4 外观三 cube(浅色/深色/跟随系统)', `count=${cubes.length}`)

  if (tag === 'real') {
    // 点击「浅色」→ 写入真后端并应用 data-theme
    const prevTheme = await js(win, `document.documentElement.dataset.theme ?? ''`)
    out(`pre theme: ${prevTheme}`)
    const clickedLight = await js(win, `(() => {
      const b = [...document.querySelectorAll('.settings-cube')].find(x => x.innerText === '浅色')
      if (b) { b.click(); return true } return false
    })()`)
    await sleep(1200)
    const lightActive = await js(win, `!![...document.querySelectorAll('.settings-cube')].find(x => x.innerText === '浅色' && x.getAttribute('data-active'))`)
    const themeAttr = await js(win, `document.documentElement.dataset.theme ?? ''`)
    mark('s5', clickedLight && lightActive && themeAttr === 'light', 'S5 点「浅色」写入 ui-theme.preference 并应用 data-theme=light', `active=${lightActive} attr=${themeAttr}`)

    // 语言 → en
    const langSet = await js(win, `(() => {
      const sel = document.querySelector('.settings-select')
      if (!sel) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(sel, 'en'); sel.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
    await sleep(1200)
    const langVal = await js(win, `document.querySelector('.settings-select')?.value ?? ''`)
    mark('s6', langSet && langVal === 'en', 'S6 语言切到 en 写入 locale.preference', `value=${langVal}`)
  } else {
    out('fixture: 跳过写路径(settings.mutate 在 fixture 只读,见审计)')
    mark('s5', true, 'S5 fixture 跳过外观写入')
    mark('s6', true, 'S6 fixture 跳过语言写入')
  }

  // 模型分区
  const toModels = await js(win, `(() => {
    const b = [...document.querySelectorAll('.settings-nav-item')].find(x => x.innerText === '模型')
    if (b) { b.click(); return true } return false
  })()`)
  const providerRows = await waitFor(win, `document.querySelectorAll('.settings-provider-row').length >= 1`, 8000)
  const provText = await js(win, `document.querySelectorAll('.settings-provider-row').length`)
  const activeGo = await js(win, `[...document.querySelectorAll('.settings-provider-row')].some(r => r.innerText.includes('opencode-go') && r.innerText.includes('active'))`)
  mark('s7', toModels && providerRows, 'S7 模型分区渲染 Provider 行', `rows=${provText}`)
  mark('s8', tag === 'real' ? activeGo : true, 'S8 Provider 行含 opencode-go(active)', tag === 'real' ? '' : '(fixture 跳过)')
  const editBtn = await js(win, `document.querySelectorAll('.settings-provider-edit').length`)
  mark('s9', editBtn >= 1, 'S9 每行有「编辑」按钮(占位)', `count=${editBtn}`)

  // 关闭
  const closed = await js(win, `(() => {
    const b = document.querySelector('.settings-close'); if (b) { b.click(); return true } return false
  })()`)
  await sleep(600)
  const shellGone = await js(win, `!document.querySelector('.settings-shell:not([hidden])')`)
  mark('s10', closed && shellGone, 'S10 关闭按钮收起设置壳')

  // 真后端还原偏好
  if (tag === 'real') {
    await js(win, `(async () => {
      const rpc = (method, payload) => fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload }) }).then(r => r.json())
      const d = await rpc('settings.describe', {})
      const ns = (name) => d.result.value.namespaces.find(n => n.ns === name)
      await rpc('settings.mutate', { ns: 'ui-theme', ops: [{ op: 'set', path: ['preference'], value: 'system' }], expectedRevision: ns('ui-theme').revision })
      const l = ns('locale')
      await rpc('settings.mutate', { ns: 'locale', ops: [{ op: 'unset', path: ['preference'] }], ...(l.revision === undefined ? {} : { expectedRevision: l.revision }) })
    })()`)
    out('restored ui-theme=system + locale 清空')
  }

  mark('s11', errors.length === 0, 'S11 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `settings-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `settings-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `settings-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== SettingsShell 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('SETTINGS PROBE FAILED', err); app.exit(1) })
