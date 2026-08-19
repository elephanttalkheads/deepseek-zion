// P1 skill 行探针 — 专用 SkillRow 工具卡(ui-skill keyed toolview)。
// fixture:alpha 历史 turn 76 的 skill 调用 → [data-tool="skill"] 行出现
// (标题 Skill + 摘要 code-review + 状态 ok),点击展开「说明」区,再点收起。
// 真后端只读:若会话有 skill 调用则断言结构,零错误。用法:
//   npx electron probe-skill.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-skill.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-skill-out')
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

  const ROW = '[data-tool="skill"]'
  // SkillRow 卡片自带 data-state(外层 chat-node 包装只有 data-tool)。
  const CARD = '[data-tool="skill"][data-state]'

  const clicked = await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
  const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)
  mark('s1', clicked && headerShown, 'S1 选中会话')

  if (tag === 'fixture') {
    // ---- S2: SkillRow 出现(状态/标题/摘要) ----
    const rowShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(CARD)})`, 12000)
    const rowState = await js(win, `(() => {
      const row = document.querySelector(${JSON.stringify(CARD)})
      if (!row) return null
      return {
        state: row.getAttribute('data-state'),
        text: (row.innerText ?? '').slice(0, 120),
        expandable: row.querySelector('[data-expandable]') !== null,
      }
    })()`)
    out(`skill row: ${JSON.stringify(rowState)}`)
    mark('s2', rowShown && rowState !== null && rowState.state === 'ok'
      && (rowState.text ?? '').includes('Skill') && (rowState.text ?? '').includes('code-review'),
      'S2 SkillRow 渲染(状态 ok + 标题 + 摘要)', JSON.stringify(rowState?.text))

    // ---- S3: 点击展开 → 「说明」区 ----
    const toggled = await js(win, `(() => {
      const row = document.querySelector(${JSON.stringify(ROW)})
      const target = row?.querySelector('[data-expandable]') ?? row
      if (!target) return false
      target.click(); return true
    })()`)
    const bodyShown = await waitFor(win, `(() => {
      const row = document.querySelector(${JSON.stringify(ROW)})
      return row ? (row.innerText ?? '').includes('说明') && row.innerText.includes('已加载 skill 说明') : false
    })()`, 6000)
    mark('s3', toggled && bodyShown, 'S3 点击展开 → 说明区(instructions 内容)')

    // ---- S4: 再点收起 ----
    const closed = await js(win, `(() => {
      const row = document.querySelector(${JSON.stringify(ROW)})
      const target = row?.querySelector('[data-expandable]') ?? row
      if (!target) return false
      target.click(); return true
    })()`)
    const bodyGone = await waitFor(win, `(() => {
      const row = document.querySelector(${JSON.stringify(ROW)})
      return row ? !(row.innerText ?? '').includes('已加载 skill 说明') : true
    })()`, 6000)
    mark('s4', closed && bodyGone, 'S4 再点收起说明区')
  } else {
    // ---- real:只读 ----
    const rowReal = await js(win, `!!document.querySelector(${JSON.stringify(ROW)})`)
    if (rowReal) {
      const st = await js(win, `document.querySelector(${JSON.stringify(ROW)})?.getAttribute('data-state') ?? ''`)
      mark('s2', st !== '', 'S2 real:SkillRow 存在', `state=${st}`)
    } else {
      mark('s2', true, 'S2 real:当前会话无 skill 调用,跳过')
    }
    for (const id of ['s3', 's4']) mark(id, true, `${id} real 只读`)
  }

  mark('s5', errors.length === 0, 'S5 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `skill-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `skill-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `skill-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== skill 探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('SKILL PROBE FAILED', err); app.exit(1) })
