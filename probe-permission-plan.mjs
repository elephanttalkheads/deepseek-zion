// P1 权限/Plan 探针 — PermissionSettingsRow(设置通用区,Full access 风险确认
// 往返)、PermissionChip(composer 权限 chip)、PlanSeat(/plan 激活 → chip →
// /plan off 关闭)。fixture 走完整写路径;真后端只读验证(不切换预设、不触发
// plan mode)。用法:
//   npx electron probe-permission-plan.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-permission-plan.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-permission-plan-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/'
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
const tag = URL.includes('fixture') ? 'fixture' : 'real'

// 选中「根级(depth0)且非运行」的会话行(子代理行/运行中行会拒绝命令 RPC)。
const SELECT_IDLE_ROOT = `(() => {
  const items = [...document.querySelectorAll('.sidebar-item')]
  const target = items.find(el => !el.hasAttribute('data-running') && (el.style.paddingLeft ?? '') === '10px')
  if (!target) return false
  target.querySelector('.sidebar-row')?.click()
  return true
})()`

// 点击文本匹配的 menuitem / dialog 内按钮 / chip 的通用工具
const clickByText = (sel, text) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})]
  const el = els.find(b => (b.innerText ?? '').includes(${JSON.stringify(text)}))
  if (el) { el.click(); return true }
  return false
})()`

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

  out(`mode: ${tag}`)

  // 选中空闲根会话(composer 权限/plan 面需要)
  const selected = await js(win, SELECT_IDLE_ROOT)
  await sleep(1500)
  mark('m0', selected, 'M0 选中根级非运行会话')

  // ---- 设置:权限默认预设行 ----
  const opened = await waitFor(win, `(() => { const b = document.querySelector('.sidebar-settings-trigger'); if (!b) return false; b.click(); return true })()`, 8000)
  const rowReady = await waitFor(win, `document.body.innerText.includes('选择新会话的默认权限模式')`, 10000)
  mark('p1', opened && rowReady, 'P1 设置通用区渲染「权限」行(默认权限模式)', tag)
  const rowCurrent = await js(win, `[...document.querySelectorAll('.settings-shell button[aria-haspopup="menu"]')].map(b => b.innerText.trim())`)
  out(`row selector labels: ${JSON.stringify(rowCurrent)}`)

  // 展开行菜单 → 预设选项(限定设置壳内;顶层工作区/模型菜单也有 aria-haspopup)
  const rowOpen = await js(win, `(() => { const b = [...document.querySelectorAll('.settings-shell button[aria-haspopup="menu"]')][0]; if (!b) return false; b.click(); return true })()`)
  const rowItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
  const rowItemTexts = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.innerText.trim())`)
  out(`row menu items: ${JSON.stringify(rowItemTexts)}`)
  mark('p2', rowOpen && rowItems, 'P2 权限行菜单展开预设项', JSON.stringify(rowItemTexts))

  if (tag === 'fixture') {
    // 行当前值 = Workspace Write(workspace-write 显示名)
    mark('p3', rowCurrent.some(t => t.includes('Workspace Write')), 'P3 行当前值显示 Workspace Write', JSON.stringify(rowCurrent))
    // 选 Full access → RiskConfirmation
    const clickedFull = await js(win, clickByText('[role="menuitem"]', 'Full access'))
    const confirmShown = await waitFor(win, `!!document.querySelector('[role="dialog"][aria-label="确认启用 Full access？"]')`, 6000)
    const confirmDisabled = await js(win, `(() => {
      const d = document.querySelector('[role="dialog"][aria-label="确认启用 Full access？"]')
      if (!d) return false
      const btn = [...d.querySelectorAll('button')].find(b => (b.innerText ?? '').includes('启用 Full access'))
      return btn !== undefined && btn.disabled === true
    })()`)
    mark('p4', clickedFull && confirmShown && confirmDisabled, 'P4 Full access 触发风险确认弹窗(未勾选时确认禁用)', `disabled=${confirmDisabled}`)
    // 勾选 → 确认
    const acked = await js(win, `(() => {
      const d = document.querySelector('[role="dialog"][aria-label="确认启用 Full access？"]')
      if (!d) return false
      const cb = d.querySelector('input[type="checkbox"]')
      if (!cb) return false
      cb.click(); return true
    })()`)
    await sleep(400)
    const confirmed = await js(win, clickByText('[role="dialog"][aria-label="确认启用 Full access？"] button', '启用 Full access'))
    const rowFull = await waitFor(win, `[...document.querySelectorAll('.settings-shell button[aria-haspopup="menu"]')].some(b => (b.innerText ?? '').includes('Full access'))`, 6000)
    mark('p5', acked && confirmed && rowFull, 'P5 勾选后确认 → 行显示 Full access(settings.mutate 往返)', `acked=${acked}`)
  } else {
    // 等行加载完成(真后端 describe 较慢,先读到「加载中」)
    await waitFor(win, `![...document.querySelectorAll('.settings-shell button[aria-haspopup="menu"]')].some(b => (b.innerText ?? '').includes('加载中'))`, 8000)
    const rowCurrentReal = await js(win, `[...document.querySelectorAll('.settings-shell button[aria-haspopup="menu"]')].map(b => b.innerText.trim())`)
    mark('p3', rowCurrentReal.some(t => t.includes('Full access')), 'P3 行当前值显示 Full access(真后端现状)', JSON.stringify(rowCurrentReal))
    const realItems = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.innerText.trim())`)
    mark('p4', realItems.length >= 2, 'P4 菜单列出预设档(只读,不选择)', JSON.stringify(realItems))
    mark('p5', true, 'P5 真后端只读,不写默认预设')
    // 关闭菜单
    await js(win, `document.body.click()`)
  }

  // 关闭设置
  await js(win, `(() => { const b = document.querySelector('.settings-close'); if (b) { b.click(); return true } return false })()`)
  await sleep(600)

  // ---- composer 权限 chip ----
  const chipLabel = await js(win, `[...document.querySelectorAll('.input-bar-modes button')].map(b => (b.getAttribute('aria-label') ?? b.innerText).trim())`)
  out(`composer modes buttons: ${JSON.stringify(chipLabel)}`)
  const chipExists = chipLabel.some(t => t.includes('访问模式，当前：'))
  mark('p6', chipExists, 'P6 composer 权限 chip 渲染(访问模式)', JSON.stringify(chipLabel))

  if (tag === 'fixture') {
    // 打开 chip 菜单 → 点 Full access → 风险确认 → 确认 → chip 标签变化
    const chipOpen = await js(win, `(() => {
      const b = [...document.querySelectorAll('.input-bar-modes button')].find(x => (x.getAttribute('aria-label') ?? '').includes('访问模式，当前：'))
      if (!b) return false
      b.click(); return true
    })()`)
    const chipItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
    const chipItemTexts = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.innerText.trim())`)
    out(`chip menu items: ${JSON.stringify(chipItemTexts)}`)
    const chipFull = await js(win, clickByText('[role="menuitem"]', 'Full access'))
    const chipConfirmShown = await waitFor(win, `!!document.querySelector('[role="dialog"][aria-label="确认启用 Full access？"]')`, 6000)
    const chipAcked = await js(win, `(() => {
      const d = document.querySelector('[role="dialog"][aria-label="确认启用 Full access？"]')
      if (!d) return false
      const cb = d.querySelector('input[type="checkbox"]')
      if (!cb) return false
      cb.click(); return true
    })()`)
    await sleep(400)
    const chipConfirmed = await js(win, clickByText('[role="dialog"][aria-label="确认启用 Full access？"] button', '启用 Full access'))
    const chipUpdated = await waitFor(win, `[...document.querySelectorAll('.input-bar-modes button')].some(b => (b.innerText ?? '').includes('Full access'))`, 6000)
    mark('p7', chipOpen && chipItems && chipFull && chipConfirmShown && chipAcked && chipConfirmed && chipUpdated,
      'P7 chip 菜单选 Full access → 风险确认 → /permission 提交 → chip 更新', `items=${JSON.stringify(chipItemTexts)}`)

    // ---- Plan chip ----
    const planAbsent0 = await js(win, `![...document.querySelectorAll('.input-bar-modes button')].some(b => (b.innerText ?? '').includes('Plan'))`)
    mark('p8', planAbsent0, 'P8 plan 未激活时 chip 不渲染')
    // 命令面板:点 /plan 进草稿 → 发送
    const panelOpen = await js(win, `(() => { const b = document.querySelector('.input-bar-add'); if (!b) return false; b.click(); return true })()`)
    const planItem = await waitFor(win, `[...document.querySelectorAll('.command-panel-item')].some(b => (b.innerText ?? '').includes('/plan'))`, 6000)
    const planPicked = await js(win, clickByText('.command-panel-item', '/plan'))
    const draftText = await js(win, `document.querySelector('.input-bar-textarea')?.value ?? ''`)
    const sent = await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (!b) return false; b.click(); return true })()`)
    const chipAppears = await waitFor(win, `[...document.querySelectorAll('.input-bar-modes button')].some(b => (b.innerText ?? '').trim() === 'Plan')`, 8000)
    mark('p9', panelOpen && planItem && planPicked && draftText.startsWith('/plan') && sent && chipAppears,
      'P9 命令面板 /plan → 提交 → plan 投影激活 → chip 出现', `draft=${JSON.stringify(draftText)}`)
    // 点 chip → /plan off → 消失
    const chipClicked = await js(win, `(() => {
      const b = [...document.querySelectorAll('.input-bar-modes button')].find(x => (x.innerText ?? '').trim() === 'Plan')
      if (!b) return false
      b.click(); return true
    })()`)
    const chipGone = await waitFor(win, `![...document.querySelectorAll('.input-bar-modes button')].some(b => (b.innerText ?? '').trim() === 'Plan')`, 8000)
    mark('p10', chipClicked && chipGone, 'P10 点 chip → /plan off → chip 消失(plan 退出)')
  } else {
    const realChip = await js(win, `[...document.querySelectorAll('.input-bar-modes button')].map(b => (b.getAttribute('aria-label') ?? b.innerText).trim())`)
    const realChipFull = realChip.some(t => t.includes('Full access'))
    const realPlanAbsent = !realChip.some(t => t === 'Plan')
    mark('p7', realChipFull, 'P7 真后端 chip 显示 Full access(投影 currentValue)', JSON.stringify(realChip))
    mark('p8', realPlanAbsent, 'P8 真后端 plan 未激活 → chip 不渲染')
    // 命令面板:确认 /permission 与 /plan 都在列表(只读)
    const panelOpen = await js(win, `(() => { const b = document.querySelector('.input-bar-add'); if (!b) return false; b.click(); return true })()`)
    const items = await waitFor(win, `document.querySelectorAll('.command-panel-item').length >= 1`, 6000)
    const cmdNames = await js(win, `[...document.querySelectorAll('.command-panel-item')].map(b => (b.innerText ?? '').split(String.fromCharCode(10))[0])`)
    mark('p9', panelOpen && items && cmdNames.some(t => t.includes('/permission')) && cmdNames.some(t => t.includes('/plan')),
      'P9 命令面板含 /permission 与 /plan', JSON.stringify(cmdNames))
    mark('p10', true, 'P10 真后端只读,不触发 plan mode')
  }

  mark('p11', errors.length === 0, 'P11 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `permission-plan-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `permission-plan-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `permission-plan-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== Permission/Plan 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('PERMISSION-PLAN PROBE FAILED', err); app.exit(1) })
