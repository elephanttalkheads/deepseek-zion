// Functional-wiring probe for the replica against the FIXTURE (?fixture).
// Verifies the M2 functional-wiring batch end to end through the live DOM:
//  1. session.create (+/新会话) -> a new session row appears and is selected
//  2. composer «+» command menu (commands.list) -> command rows render
//  3. slash dispatch (/echo …) -> session.command executes via the commands remote
//  4. goal bar (无目标隐藏 + /goal 命令创建 + projection 相位编舞 pause/resume/blocked)
//  5. workspace menu (workspace.list + create via Miller 目录浏览弹窗 + rename/delete)
//  6. subagent panel (subagents.list via refreshSubagents) renders in the right column
// Usage: npx electron probe-functional.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-functional-out')
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
const text = (win, sel) => js(win, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.innerText : null })()`)

// React-18-safe synthetic typing: use the native value setter (React tracks
// the value descriptor; direct `.value =` + input event is ignored).
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

  const url = process.env.ZION_URL ?? 'http://localhost:5199/?fixture'
  await win.loadURL(url)
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const results = {}
  const details = {}
  const check = async (id, expr, label) => {
    const ok = await waitFor(win, expr, 12000)
    results[id] = ok
    details[id] = `${label}: ${ok ? 'PASS' : 'FAIL'}`
    console.log(`${ok ? '✅' : '❌'} ${label}`)
  }

  // 1. session.create — 新会话 creates a blank session and selects it. Blank
  //    sessions are hidden in the sidebar, so probe creation via InputBar mount.
  await js(win, `(() => { const b = document.querySelector('.shell-new'); if (b) b.click(); return !!b })()`)
  await check('01', `!!document.querySelector('.input-bar')`, '01 session.create: 新会话创建并被选中(InputBar 挂载)')
  await check('02', `!!document.querySelector('.input-bar-textarea') && !document.querySelector('.goal-bar')`, '02 session.create: 新会话就绪(textarea 渲染;无目标 goal bar 隐藏)')

  // 2. composer «+» command menu (commands.list).
  await js(win, `(() => { const b = document.querySelector('.input-bar-add'); if (b) b.click(); return !!b })()`)
  await check('03', `document.querySelectorAll('.command-panel-item').length >= 3 && !!document.querySelector('.command-panel-name')`, '03 命令面板: commands.list 渲染命令行(≥3)')
  const cmdNames = await js(win, `[...document.querySelectorAll('.command-panel-item .command-panel-name')].map(e => e.innerText).join(',')`)
  details['04'] = `命令 = ${cmdNames}`
  await check('04', `true`, '04 命令列表(details)')
  await js(win, `document.querySelector('.command-panel-item')?.click()`)
  await sleep(300)
  const draft = await js(win, `document.querySelector('.input-bar-textarea')?.value ?? ''`)
  details['05'] = `点击命令后草稿 = ${JSON.stringify(draft)}`
  await check('05', `${JSON.stringify(draft)}.startsWith('/')`, '05 选择命令 → 草稿填入 /command')

  // 3. slash dispatch via session.command (commands.execute).
  await typeInto(win, '.input-bar-textarea', '/echo 功能接线验收')
  await sleep(200)
  const draftBeforeSend = await js(win, `document.querySelector('.input-bar-textarea')?.value ?? ''`)
  details['05b'] = `发送前草稿 = ${JSON.stringify(draftBeforeSend)}`
  await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (b) b.click(); return !!b })()`)
  await sleep(800)
  const errStrip = await text(win, '.input-bar-error')
  details['06'] = `slash 提交后错误条 = ${errStrip ?? '(空)'}`
  await check('06', `(${JSON.stringify(errStrip ?? '')} === '' || ${JSON.stringify(errStrip ?? '')} === null)`, '06 commands.execute: /echo 提交无错误')

  // 4. goal bar — 2026-08-21 起无目标时整条隐藏(对齐官方),创建走 /goal slash
  //    命令(InputBar 以 / 开头的行派发到 commands.execute;fixture 建 active 目标)。
  //    结构 = 靶标 SVG + 相位标签(进行中的目标/已暂停的目标/受阻的目标)+ 目标文本
  //    + 图标动作组(data-action);动作语义不变。
  await check('07', `!document.querySelector('.goal-bar')`, '07 goal bar 未设定时隐藏(对齐官方)')
  await typeInto(win, '.input-bar-textarea', '/goal 功能接线验收目标')
  await sleep(200)
  await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (b) b.click(); return !!b })()`)
  await sleep(800)
  {
    await check('09', `!!document.querySelector('.goal-bar-objective-text') && document.querySelector('.goal-bar-objective-text')?.innerText.includes('功能接线验收目标')`, '09 /goal 命令: 目标显示在 goal bar')
    await check('10', `!!document.querySelector('.goal-bar[data-phase="active"]') && document.querySelector('.goal-bar-phase')?.innerText === '进行中的目标'`, '10 goal: 相位=active(标签「进行中的目标」)')
    await check('10b', `!!document.querySelector('.goal-bar-target') && !!document.querySelector('.goal-bar-btn[data-action="pause"]') && !!document.querySelector('.goal-bar-btn[data-action="complete"]')`, '10b goal 结构: 靶标 SVG + pause/complete 动作组')
    // pause via button
    await js(win, `document.querySelector('.goal-bar-btn[data-action="pause"]')?.click()`)
    await check('11', `!!document.querySelector('.goal-bar[data-phase="paused"]') && document.querySelector('.goal-bar-phase')?.innerText === '已暂停的目标'`, '11 goal.pause: 相位=paused(琥珀静止)')
    // resume via the same toggle
    await js(win, `document.querySelector('.goal-bar-btn[data-action="resume"]')?.click()`)
    await check('11b', `!!document.querySelector('.goal-bar[data-phase="active"]')`, '11b goal.resume: pause↔resume 切换回 active')
    // blocked 相(探针缝注入 session/projection goal 帧):橙红 glitch + 无 pause/resume 钮(对齐官方)
    const goalSessionId = await js(win, `window.__zionProbeGetSelectedSessionId?.() ?? null`)
    details['11c'] = `blocked 注入目标会话 = ${goalSessionId ?? '(无探针缝)'}`
    if (goalSessionId !== null) {
      const blockedFrame = { type: 'session/projection', sessionId: goalSessionId, key: 'goal', value: { goal: { id: 'probe-goal-blocked', revision: 1, objective: '功能接线验收目标', phase: 'blocked' } }, seq: 99999 }
      await js(win, `window.__zionProbePushMuxFrame(${JSON.stringify(blockedFrame)})`)
      await check('11d', `!!document.querySelector('.goal-bar[data-phase="blocked"]') && document.querySelector('.goal-bar-phase')?.innerText === '受阻的目标'`, '11d goal blocked 相: 标签「受阻的目标」(橙红 glitch)')
      await check('11e', `!document.querySelector('.goal-bar-btn[data-action="pause"]') && !document.querySelector('.goal-bar-btn[data-action="resume"]') && !!document.querySelector('.goal-bar-btn[data-action="complete"]') && !!document.querySelector('.goal-bar-btn[data-action="clear"]')`, '11e blocked 相无 pause/resume 钮,complete/clear 保留')
    } else {
      results['11d'] = results['11e'] = false
      console.log('❌ 11c 缺少 __zionProbeGetSelectedSessionId 探针缝')
    }
  }

  // 5. workspace menu — list + create (host.pickDirectory fake path) + rename + delete.
  await js(win, `(() => { const b = document.querySelector('.shell-workspace'); if (b) b.click(); return !!b })()`)
  await check('12', `document.querySelectorAll('.workspace-menu-item').length >= 1`, '12 workspace menu: 工作区列表渲染')
  const wsCount = await js(win, `document.querySelectorAll('.workspace-menu-item').length`)
  details['13'] = `工作区数量 = ${wsCount}`
  await check('13', `true`, '13 工作区(details)')
  // create (P3-⑨:应用内 Miller 目录浏览弹窗;打开即采用当前层级 → 面板关闭;
  // 重开菜单验证新行)
  await js(win, `(() => { const b = document.querySelector('.workspace-menu-create'); if (b) b.click(); return !!b })()`)
  const browseShown = await waitFor(win, `!!document.querySelector('[role="dialog"]')`, 8000)
  details['13b'] = `浏览弹窗出现 = ${browseShown}`
  await js(win, `(() => { const d = [...document.querySelectorAll('[role="dialog"]')].at(-1); const b = d ? [...d.querySelectorAll('button')].find(x => (x.innerText ?? '').trim() === '打开') : null; if (b) b.click(); return !!b })()`)
  await waitFor(win, `![...document.querySelectorAll('[role="dialog"]')].some(d => (d.innerText ?? '').includes('选择工作区目录'))`, 8000)
  await js(win, `(() => { const b = document.querySelector('.shell-workspace'); if (b) b.click(); return !!b })()`)
  await check('14', `document.querySelectorAll('.workspace-menu-item').length > ${wsCount}`, '14 workspace.create: 新工作区行出现(重开菜单)')
  const newWsTitle = await js(win, `(() => { const rows = [...document.querySelectorAll('.workspace-menu-item')]; return rows[rows.length - 1]?.querySelector('.workspace-menu-title')?.innerText ?? '(none)' })()`)
  details['14b'] = `新建工作区 = ${newWsTitle}`
  // delete the created workspace (last row of the now-open menu)
  await js(win, `(() => { const rows = [...document.querySelectorAll('.workspace-menu-item')]; const last = rows[rows.length - 1]; const del = last?.querySelector('.workspace-menu-btn-danger'); if (del) del.click(); return !!del })()`)
  await sleep(600)
  await check('15', `document.querySelectorAll('.workspace-menu-item').length <= ${wsCount}`, '15 workspace.delete: 创建的工作区被删除')
  await js(win, `(() => { const b = document.querySelector('.shell-workspace'); if (b) b.click(); return !!b })()`)

  // 6. subagent panel in the right column.
  await check('16', `!!document.querySelector('.subagent-panel')`, '16 subagent panel 渲染')
  await check('17', `document.querySelectorAll('.subagent-panel-refresh').length >= 1`, '17 subagent refresh 按钮存在')

  // overview
  const goalText = await text(win, '.goal-bar')
  details['99'] = `goal bar 现状 = ${goalText ?? '(空)'}`

  results['18'] = errors.length === 0 ? true : undefined
  details['18'] = errors.length === 0 ? '控制台零错误: PASS' : `控制台错误: ${errors.length}`
  console.log(`${errors.length === 0 ? '✅' : '❌'} 18 控制台错误(${errors.length})`)

  fs.writeFileSync(path.join(OUT, 'functional.json'), JSON.stringify({ results, details, errors, cmdNames, draft, goalText }, null, 2))
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'functional.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'functional-errors.txt'), errors.join('\n'))

  const pass = Object.values(results).filter(Boolean).length
  const total = Object.values(results).length
  console.log(`\n== 功能接线 probe: ${pass}/${total} pass ==`)
  app.quit()
}).catch(err => { console.error('FUNCTIONAL PROBE FAILED', err); app.exit(1) })
