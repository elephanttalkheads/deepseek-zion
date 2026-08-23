// Ambient-layers probe (FIXTURE): ZION 块 1+2+16 落地验证。
//  1. #rain canvas + .scanlines 挂载在 app-frame 下
//  2. 三个本地字体可加载(document.fonts.check),body 字体链切到 Share Tech Mono
//  3. 全 UI 半透明口径:侧栏/顶栏背景 alpha=0.92
//  4. fx 两档驱动:默认 READY speed=1;推 host/session-status running:true → 2.2;false → 回 1
//  5. 雨幕动画活:相邻采样像素变化(非静态帧)
// Usage: npx electron probe-ambient.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-ambient-out')
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

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })

  const url = process.env.ZION_URL ?? 'http://localhost:5199/?fixture'
  await win.loadURL(url)
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const out = (s) => { lines.push(s); console.log(s) }
  const check = async (id, expr, label, waitMs = 12000) => {
    const ok = await waitFor(win, expr, waitMs)
    out(`${id}: ${ok ? 'PASS' : 'FAIL'} — ${label}`)
    return ok
  }

  // 1. 氛围层挂载
  await check('rain-mounted', `!!document.querySelector('.app-frame canvas#rain')`, '#rain canvas 挂载在 app-frame 下')
  await check('scanlines-mounted', `!!document.querySelector('.app-frame .scanlines')`, '.scanlines 挂载在 app-frame 下')
  await check('rain-pointer-events', `getComputedStyle(document.querySelector('#rain')).pointerEvents !== 'none' ? getComputedStyle(document.querySelector('.scanlines')).pointerEvents === 'none' : true`, '扫描线 pointer-events:none 不拦截交互')
  await check('rain-zindex', `getComputedStyle(document.querySelector('#rain')).zIndex === '-1'`, '#rain z-index=-1 恒在 UI 之下')

  // 2. 字体资产
  await check('font-sharetech', `document.fonts.check('14px "Share Tech Mono"')`, 'Share Tech Mono 已加载')
  await check('font-sarasa', `document.fonts.check('14px "Sarasa Term SC"')`, 'Sarasa Term SC 已加载')
  await check('font-matrixcode', `document.fonts.check('18px "Matrix Code"')`, 'Matrix Code 已加载')
  await check('body-font', `getComputedStyle(document.body).fontFamily.includes('Share Tech Mono')`, 'body 字体链切到 Matrix 回退链')

  // 3. 全 UI 半透明口径(alpha 0.92)
  await check('sidebar-alpha', `getComputedStyle(document.querySelector('.app-sidebar')).backgroundColor === 'rgba(2, 18, 9, 0.92)'`, '侧栏背景 alpha 0.92')
  await check('topbar-alpha', `getComputedStyle(document.querySelector('.shell-topbar')).backgroundColor === 'rgba(2, 18, 9, 0.92)'`, '顶栏背景 alpha 0.92')

  // 4. fx 两档驱动(fixture 发一条 prompt,fixture 回放会推真 host/session-status)
  await check('fx-default', `window.__zionAmbientFx && window.__zionAmbientFx.speed === 1 && window.__zionAmbientFx.energy === 0.3`, 'fx 默认 READY 档 {1, 0.3}')
  await js(win, `document.querySelector('.shell-new').click(); true`)
  await waitFor(win, `!!(window.__zionProbeGetSelectedSessionId && window.__zionProbeGetSelectedSessionId())`, 8000)
  const sessionId = await js(win, `window.__zionProbeGetSelectedSessionId()`)
  const typed = await js(win, `(() => {
    const ta = document.querySelector('.input-bar-textarea')
    if (!ta) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, 'fx 档位探针')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(300)
  const sent = await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (!b) return false; b.click(); return true })()`)
  out(`prompt sent: ${sent} (typed: ${typed}, session: ${sessionId ?? '?'})`)
  await check('fx-busy', `window.__zionAmbientFx.speed === 2.2 && window.__zionAmbientFx.energy === 0.85`, '回合 running → fx 忙碌档 {2.2, 0.85}')
  await check('fx-ready-again', `window.__zionAmbientFx.speed === 1 && window.__zionAmbientFx.energy === 0.3`, '回合闭环 → fx 回 READY 档', 20000)

  // 5. 雨幕动画活(READY 档 90ms 节流,1.2s 内必有帧推进)
  const animated = await js(win, `(async () => {
    const c = document.getElementById('rain')
    if (!c) return false
    const a = c.toDataURL()
    await new Promise(r => setTimeout(r, 1200))
    return c.toDataURL() !== a
  })()`)
  out(`rain-animated: ${animated ? 'PASS' : 'FAIL'} — 雨幕帧在推进(非静态)`)

  // 截图(雨幕需 ~13s 爬满,此处拍的是加载后状态,形态基准另见 ui-prototype/ambient)
  await win.webContents.capturePage(); await sleep(150)
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'ambient.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'ambient.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'ambient-errors.txt'), errors.join('\n'))
  out(`errors: ${errors.length}`)
  out('--- done ---')
  app.quit()
})
