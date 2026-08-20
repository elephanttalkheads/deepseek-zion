// 插件设置分区探针 — 设置 → 插件页(插件配置三卡 + 插件列表三组)。
// fixture 轨走全流程:导航无「插件清单」项、两 tab、三卡片展开/编辑/保存、
// 清单三组渲染/搜索/展开/社区说明;real 轨只读验证(不保存,不写后端)。
// 用法:
//   npx electron probe-plugin-settings.mjs                      # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-plugin-settings.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-plugin-settings-out')
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

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL(URL)
  await waitFor(win, `!!document.querySelector('.sidebar-settings-trigger')`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }
  const clickByText = (sel, text) => `(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})]
    const el = els.find(b => (b.innerText ?? '').includes(${JSON.stringify(text)}))
    if (el) { el.click(); return true }
    return false
  })()`

  out(`mode: ${tag}`)

  // ---- P1: 打开设置 → 导航无「插件清单」项,有「插件」 ----
  const opened = await js(win, `(() => { const b = document.querySelector('.sidebar-settings-trigger'); if (!b) return false; b.click(); return true })()`)
  const shellShown = await waitFor(win, `!!document.querySelector('.settings-shell')`, 6000)
  const navTexts = await js(win, `[...document.querySelectorAll('.settings-nav-item')].map(b => b.innerText.trim())`)
  out(`nav items: ${JSON.stringify(navTexts)}`)
  mark('p1', opened && shellShown && navTexts.includes('插件') && !navTexts.includes('插件清单'),
    'P1 设置导航含「插件」且无「插件清单」', JSON.stringify(navTexts))

  // ---- P2: 进入插件分区 → 标题/intro/两 tab ----
  const clicked = await js(win, clickByText('.settings-nav-item', '插件'))
  const sectionShown = await waitFor(win, `!!document.querySelector('.plugins-section')`, 6000)
  const title = await js(win, `document.querySelector('.plugins-section .settings-section-title')?.innerText ?? ''`)
  const intro = await js(win, `document.querySelector('.plugins-section .settings-hint')?.innerText ?? ''`)
  const tabs = await js(win, `[...document.querySelectorAll('.plugins-tab')].map(b => b.innerText.trim())`)
  mark('p2', clicked && sectionShown && title === '插件' && intro.includes('配置和查看本部署已安装的插件')
    && tabs.includes('插件配置') && tabs.includes('插件列表'),
    'P2 插件分区:标题/intro/两 tab', `tabs=${JSON.stringify(tabs)}`)

  // ---- P3: 插件配置 tab 三卡片(终端/Agent 循环/网页搜索) ----
  const cardNames = await waitFor(win, `document.querySelectorAll('.plugin-card').length >= 3`, 8000).then(async () =>
    await js(win, `[...document.querySelectorAll('.plugin-card-name')].map(b => b.innerText.trim())`))
  mark('p3', Array.isArray(cardNames) && ['终端', 'Agent 循环', '网页搜索'].every(x => cardNames.includes(x)),
    'P3 插件配置三卡片', JSON.stringify(cardNames))

  // ---- P4(fixture):展开终端卡 → 字段回显 → 编辑 → 保存 → 值更新 ----
  if (tag === 'fixture') {
    const openedCard = await js(win, clickByText('.plugin-card-header', '终端'))
    const fieldsShown = await waitFor(win, `document.querySelectorAll('.plugin-card[data-open] .plugin-field-input').length >= 2`, 6000)
    const before = await js(win, `[...document.querySelectorAll('.plugin-card[data-open] .plugin-field-input')].map(i => i.value)`)
    const edited = await js(win, `(() => {
      const inputs = [...document.querySelectorAll('.plugin-card[data-open] .plugin-field-input')]
      const timeout = inputs.find(i => i.id === 'plugin-config-shell-timeoutMs')
      if (!timeout) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(timeout, '90000')
      timeout.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    // React 受控 input 的 state 提交是异步的:编辑后等一拍再点保存,否则
    // 保存按钮仍处 disabled(未感知 dirty)。
    await sleep(400)
    // 注意:必须精确匹配 trim()==='保存' —— header 里「未保存」也含「保存」,
    // includes 会误点 header 导致卡片收起。
    const saved = await js(win, `(() => {
      const el = [...document.querySelectorAll('.plugin-card[data-open] button')].find(b => (b.innerText ?? '').trim() === '保存')
      if (el) { el.click(); return true }
      return false
    })()`)
    const after = await waitFor(win, `(() => {
      const inputs = [...document.querySelectorAll('.plugin-card[data-open] .plugin-field-input')]
      const t = inputs.find(i => i.id === 'plugin-config-shell-timeoutMs')
      return t !== undefined && t.value === '90000' && ![...document.querySelectorAll('.plugin-card-pending')].some(x => x.innerText.includes('未保存'))
    })()`, 8000)
    mark('p4', openedCard && fieldsShown && edited && saved && after,
      'P4 终端卡:展开/回显/编辑/保存生效', `before=${JSON.stringify(before)} → timeoutMs=90000`)
  } else {
    const openedCard = await js(win, clickByText('.plugin-card-header', '终端'))
    const fieldsShown = await waitFor(win, `document.querySelectorAll('.plugin-card[data-open] .plugin-field-input').length >= 2`, 6000)
    const values = await js(win, `[...document.querySelectorAll('.plugin-card[data-open] .plugin-field-input')].map(i => ({ id: i.id, v: i.value }))`)
    mark('p4', openedCard && fieldsShown, 'P4 终端卡只读验证(不保存)', JSON.stringify(values))
  }

  // ---- P5: 切到插件列表 tab → 三组渲染 ----
  const toList = await js(win, clickByText('.plugins-tab', '插件列表'))
  const groupsShown = await waitFor(win, `document.querySelectorAll('.plugin-inventory-group').length >= 2`, 8000)
  const groupHeads = await js(win, `[...document.querySelectorAll('.plugin-inventory-group-head')].map(h => ({ label: h.querySelector('span')?.innerText, count: h.querySelector('[data-count]')?.getAttribute('data-count') }))`)
  const groupTags = await js(win, `[...document.querySelectorAll('.plugin-inventory-group')].map(g => g.getAttribute('data-group'))`)
  mark('p5', toList && groupsShown && groupTags.includes('official') && groupTags.includes('mcp') && groupTags.includes('community'),
    'P5 插件列表三组渲染', JSON.stringify(groupHeads))

  // ---- P5b: 总数标题(官方 catalogHeading 同构:「插件列表 N」= 三组之和) ----
  const totalHead = await js(win, `(() => {
    const h = document.querySelector('.plugin-inventory-catalog-head')
    if (!h) return null
    const title = h.querySelector('h3')?.innerText ?? ''
    const count = h.querySelector('[data-plugin-count]')?.getAttribute('data-plugin-count')
    return { title, count: count === undefined ? null : Number(count) }
  })()`)
  const groupSum = await js(win, `[...document.querySelectorAll('.plugin-inventory-group [data-count]')].reduce((a, e) => a + Number(e.getAttribute('data-count') || 0), 0)`)
  mark('p5b', totalHead !== null && totalHead.title === '插件列表' && totalHead.count === groupSum && totalHead.count > 0,
    'P5b 插件列表总数标题 = 三组之和', JSON.stringify(totalHead))

  // ---- P6: 社区徽标 + 展开社区行 → UI 注入说明 ----
  const communityTag = await js(win, `[...document.querySelectorAll('.plugin-inventory-community-tag')].map(t => t.innerText.trim())`)
  const openedCommunity = await js(win, `(() => {
    const row = [...document.querySelectorAll('.plugin-inventory-group[data-group="community"] .plugin-inventory-card')][0]
    const b = row?.querySelector('.plugin-inventory-card-content')
    if (!b) return false
    b.click(); return true
  })()`)
  const noteShown = await waitFor(win, `!!document.querySelector('.plugin-inventory-community-note')`, 6000)
  const noteText = await js(win, `document.querySelector('.plugin-inventory-community-note dd')?.innerText ?? ''`)
  mark('p6', communityTag.includes('社区') && openedCommunity && noteShown && noteText.includes('未实现'),
    'P6 社区徽标 + 展开说明(UI 注入未实现)', JSON.stringify(communityTag))

  // ---- P7(fixture):搜索 github → MCP 组内过滤 ----
  if (tag === 'fixture') {
    const typed = await js(win, `(() => {
      const input = document.querySelector('.plugin-inventory-search input')
      if (!input) return false
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'github')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    const filtered = await waitFor(win, `[...document.querySelectorAll('.plugin-inventory-card-title')].some(t => (t.innerText ?? '').includes('github'))`, 6000)
    const titles = await js(win, `[...document.querySelectorAll('.plugin-inventory-card-title')].map(t => t.innerText.trim())`)
    const counts = await js(win, `[...document.querySelectorAll('.plugin-inventory-group')].filter(g => g.querySelectorAll('.plugin-inventory-card').length > 0).map(g => g.getAttribute('data-group'))`)
    mark('p7', typed && filtered && counts.every(g => g === 'mcp'), 'P7 搜索 github → 仅 MCP 组保留', `titles=${JSON.stringify(titles)} groups=${JSON.stringify(counts)}`)
    await js(win, `(() => { const i = document.querySelector('.plugin-inventory-search input'); if (!i) return; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await sleep(300)
  } else {
    mark('p7', true, 'P7 真后端只读,不测搜索过滤')
  }

  // ---- P8: 关闭设置,零控制台错误 ----
  await js(win, `(() => { const b = document.querySelector('.settings-close'); if (b) b.click(); return true })()`)
  await sleep(300)
  mark('p8', errors.length === 0, 'P8 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `plugin-settings-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `plugin-settings-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `plugin-settings-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== PluginSettings 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('PLUGIN-SETTINGS PROBE FAILED', err); app.exit(1) })
