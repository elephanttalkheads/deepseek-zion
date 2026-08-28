// 归档过滤探针 — 验证「归档会话从侧边栏消失」在真实数据上生效。
//   A. 加载后:runtime 的 archivedSessionIds 与可见行互斥(已归档不在行内)。
//   B. 反应路径:把某个可见行设为归档 → 该行从侧边栏消失;清空 → 行回归。
//   全程不触碰后端数据(仅驱动 UI 过滤状态)。
// 用法:
//   npx electron probe-archive-filter.mjs                      # 真后端(默认 5199)
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-archive-filter.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-archive-filter-out')
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
  await waitFor(win, `document.querySelectorAll('.sidebar-item').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out(`mode: ${tag}`)

  // ---- A: 已归档 ids 与可见行互斥(ASCII 城市:全量可见行在 City Index 内) ----
  await js(win, `(() => { const b = document.querySelector('.map-toggle'); if (b) b.click(); return !!b })()`)
  await waitFor(win, `document.querySelectorAll('.map-row').length >= 1`, 8000)
  const archived = await js(win, `window.__zionProbeGetArchivedSessionIds?.() ?? null`)
  out(`runtime archivedSessionIds (${tag}): ${JSON.stringify(archived)}`)
  const rows = await js(win, `[...document.querySelectorAll('.map-row')].map(r => ({ id: r.getAttribute('data-session-id'), title: r.querySelector('.title')?.textContent?.trim() ?? '' }))`)
  out(`visible rows: ${rows.length}`)
  if (Array.isArray(rows) && rows.length > 0) out(`  e.g. ${JSON.stringify(rows.slice(0, 4))}`)

  let aOK = true
  let aNote = ''
  if (archived !== null && Array.isArray(rows)) {
    const visibleIds = new Set(rows.map(r => r.id))
    const leaked = (Array.isArray(archived) ? archived : []).filter(id => visibleIds.has(id))
    aOK = leaked.length === 0
    aNote = leaked.length > 0 ? `泄漏 ${leaked.length} 个已归档 id 进侧边栏: ${JSON.stringify(leaked)}` : `${archived.length} 个已归档 id 均未出现在行内`
  } else if (archived === null) {
    aOK = true
    aNote = '(seam 不可用,跳过)'
  }
  mark('a1', aOK, 'A1 已归档会话不在侧边栏可见行', aNote)

  // ---- B: 反应路径(只驱动 UI 过滤状态,不碰后端) ----
  // 全量可见行在 City Index(A1 已打开);活跃工作区可能只有 1 条非 blank 会话
  // (blank 仅当前可见)——先点「+」新建一条(blank 但被选中 → 未分组 BAY 可见),
  // 凑够 ≥2 行再取非当前行做归档对象。
  let bRows = await js(win, `[...document.querySelectorAll('.map-row')].map(r => r.getAttribute('data-session-id')).filter(Boolean)`)
  if (Array.isArray(bRows) && bRows.length < 2) {
    await js(win, `(() => { const b = document.querySelector('.sidebar-new'); if (b) b.click(); return !!b })()`)
    await waitFor(win, `document.querySelectorAll('.map-row').length >= 2`, 8000)
    bRows = await js(win, `[...document.querySelectorAll('.map-row')].map(r => r.getAttribute('data-session-id')).filter(Boolean)`)
  }
  const idleId = await js(win, `[...document.querySelectorAll('.map-row')].filter(r => !r.querySelector('.map-session-button')?.classList.contains('is-current')).map(r => r.getAttribute('data-session-id'))[0] ?? null`)
  if (Array.isArray(bRows) && bRows.length >= 2 && idleId !== null) {
    const pick = idleId // 非当前行(当前行被归档时官方会清空选择)
    const before = await js(win, `document.querySelectorAll('.map-row').length`)
    const setOK = await js(win, `(() => {
      const cur = window.__zionProbeGetArchivedSessionIds()
      window.__zionProbeSetArchivedSessionIds([...cur, ${JSON.stringify(pick)}])
      return true
    })()`)
    const gone = await waitFor(win, `![...document.querySelectorAll('.map-row')].some(r => r.getAttribute('data-session-id') === ${JSON.stringify(pick)})`, 8000)
    const afterHide = await js(win, `document.querySelectorAll('.map-row').length`)
    // 清空归档 → 行回归
    const clearOK = await js(win, `(() => { window.__zionProbeSetArchivedSessionIds([]); return true })()`)
    const back = await waitFor(win, `[...document.querySelectorAll('.map-row')].some(r => r.getAttribute('data-session-id') === ${JSON.stringify(pick)})`, 8000)
    const afterBack = await js(win, `document.querySelectorAll('.map-row').length`)
    mark('b1', setOK && gone && clearOK && back, 'B1 归档某行 → 行消失;清空 → 行回归', `id=${pick}, rows ${before}→${afterHide}→${afterBack}`)
  } else {
    mark('b1', false, 'B1 需要 ≥2 可见行且有非当前行', `rows=${bRows?.length ?? 0}, idle=${idleId}`)
  }

  // ---- C: 「归档会话」入口仍存在(City Index 行 ⋯ 菜单;feature 入口不丢) ----
  const menuOpened = await js(win, `(() => { const b = document.querySelector('.map-row-menu'); if (!b) return false; b.click(); return true })()`)
  const menuItems = await waitFor(win, `document.querySelectorAll('[role="menuitem"]').length >= 1`, 6000)
  const menuTexts = await js(win, `[...document.querySelectorAll('[role="menuitem"]')].map(b => b.innerText.trim())`)
  mark('c1', menuOpened && menuItems && menuTexts.includes('归档会话'), 'C1 会话行 … 菜单含「归档会话」入口', JSON.stringify(menuTexts))
  await js(win, `(() => { window.__zionProbeSetArchivedSessionIds([]); document.body.click(); return true })()`)

  mark('z', errors.length === 0, 'Z 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `archive-filter-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `archive-filter-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `archive-filter-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== ArchiveFilter 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('ARCHIVE-FILTER PROBE FAILED', err); app.exit(1) })
