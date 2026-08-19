// dynamicCordisRunner 运行编排 UI(③)探针 — 真后端:
//   运行控制台存在 + 刷新清单(inventory)→ 空清单提示;注入 cordis/request-run 帧 →
//   审批卡出现「批准并信任」→ 点击(approve futureVersions)→ 编排解析;全程零错误。
// 用法: npx electron probe-cordis-console.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-cordis-console-out')
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
  await waitFor(win, `!!document.querySelector('.plugin-host')`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out('--- 运行控制台 ---')
  const consoleLabel = await js(win, `document.querySelector('.plugin-console-label')?.innerText ?? ''`)
  mark('c1', consoleLabel.includes('运行控制台'), 'C1 PluginHost 运行控制台存在')
  const refreshBtn = await js(win, `[...document.querySelectorAll('.plugin-console button')].some(b => b.innerText === '刷新清单')`)
  mark('c2', refreshBtn, 'C2 「刷新清单」按钮')
  await js(win, `[...document.querySelectorAll('.plugin-console button')].find(b => b.innerText === '刷新清单')?.click()`)
  await sleep(900)
  const invOk = await js(win, `document.querySelector('.plugin-console-result')?.innerText ?? ''`)
  const emptyHint = await js(win, `document.querySelector('.plugin-console-empty')?.innerText ?? ''`)
  out(`inventory rows: ${await js(win, `document.querySelectorAll('.plugin-console-row').length`)} empty: ${JSON.stringify(emptyHint)}`)
  mark('c3', invOk === '' || invOk.includes('ok'), 'C3 刷新清单(inventory)无传输错误', invOk || '(空)')
  mark('c4', emptyHint !== '', 'C4 空清单提示(本环境无动态插件)', emptyHint || '')

  out('--- approval 编排:批准并信任(futureVersions) ---')
  const request = {
    requestId: 'zion-probe-request-1',
    agentId: 'no-such-agent',
    pluginId: 'probe-plugin',
    packageId: 'probe-pkg',
    mode: 'run',
    name: 'probe-cordis-run',
    purpose: '自动验收:验证批准并信任按钮',
    requiresApproval: true,
  }
  await js(win, `window.__zionProbeHandleRemoteEvent('cordis/request-run', [${JSON.stringify(request)}])`)
  const cardShown = await waitFor(win, `document.querySelectorAll('.plugin-approval[data-kind="cordis-run"]').length >= 1`, 6000)
  const hasTrust = await js(win, `[...document.querySelectorAll('.plugin-approval-actions button')].some(b => b.innerText === '批准并信任')`)
  out(`approval card: ${cardShown}, trust button: ${hasTrust}`)
  mark('c5', cardShown && hasTrust, 'C5 审批卡渲染且含「批准并信任」(approve futureVersions)')

  const trusted = await js(win, `(() => {
    const b = [...document.querySelectorAll('.plugin-approval-actions button')].find(x => x.innerText === '批准并信任')
    if (b) { b.click(); return true } return false
  })()`)
  await sleep(1500)
  // 编排会经 resolveRequestRun 发向宿主;host 对 no-such-agent 拒绝→ 进入 runErrors 或关闭
  const cardsLeft = await js(win, `document.querySelectorAll('.plugin-approval[data-kind="cordis-run"]').length`)
  out(`approval cards after trust: ${cardsLeft}`)
  mark('c6', trusted, 'C6 点击「批准并信任」(评审悬停走向解析)')
  // 清理:若卡片仍挂,decline 关闭
  await js(win, `(() => {
    const b = document.querySelector('.plugin-approval[data-kind="cordis-run"] .plugin-approval-reject')
    if (b) b.click()
  })()`)

  mark('c7', errors.length === 0, 'C7 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'cordis-console.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'cordis-console.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'cordis-console-errors.txt'), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== dynamicCordisRunner 编排 UI 探针: ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('CORDIS CONSOLE PROBE FAILED', err); app.exit(1) })
