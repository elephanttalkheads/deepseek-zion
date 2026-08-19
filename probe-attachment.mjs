// P1 附件 Lightbox / 拖放覆盖层探针 — 消息图片(MessageImage → ImageLightbox)
// + 整页拖放摄入(DropOverlay → AttachmentRail → Lightbox)。
// fixture 走全流程:alpha 历史含图片块(加载/点击原图预览/Escape 关闭);
// 合成拖拽事件(DataTransfer+PNG File)→ 覆盖层出现 → drop → rail 出现 →
// 点缩略图开 Lightbox → 移除。真后端只读:零错误;若有历史图片则打开验证。
// 用法:
//   npx electron probe-attachment.mjs                       # 真后端
//   $env:ZION_URL='http://localhost:5199/?fixture'; npx electron probe-attachment.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-attachment-out')
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
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA/xl1SAAAAvklEQVR42u3SMQ0AAAjAMIyhELM4AAe8PD1qYFlk9cCXEAEDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGBANiQDAgBgQDYkAwIAYEA2JAMCAGxIBCYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIBgQAwIBsSAYEAMCAbEgGBADAgGxIAYEAyIAcGAGBAMiAHBgBgQDIgBwYAYEAyIAcGAGBAMiAHBgBgQDIgB4bYWLb6pnOb1xAAAAABJRU5ErkJggg=='

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

  const IMG_BTN = 'button[title="查看原图"]'
  const LIGHTBOX = '[role="dialog"][aria-label="原图预览"]'
  const RAIL = '[role="group"][aria-label="待发送图片"]'

  // ---- A1: 进入会话 ----
  const clicked = await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
  const headerShown = await waitFor(win, `!!document.querySelector('.conversation-header')`, 8000)
  mark('a1', clicked && headerShown, 'A1 选中会话')

  if (tag === 'fixture') {
    // ---- A2: 历史图片缩略图出现且加载(自然宽 > 0) ----
    const imgShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(IMG_BTN)})`, 12000)
    const imgLoaded = await waitFor(win, `(() => {
      const b = document.querySelector(${JSON.stringify(IMG_BTN)})
      const img = b?.querySelector('img')
      return !!img && img.complete && img.naturalWidth > 0
    })()`, 12000)
    mark('a2', imgShown && imgLoaded, 'A2 消息图片缩略图渲染并加载(session.readAttachment)')

    // ---- A3: 点击 → Lightbox 原图预览 ----
    const opened = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(IMG_BTN)}); if (!b) return false; b.click(); return true })()`)
    const lbShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(LIGHTBOX)})`, 6000)
    const lbImg = await js(win, `(() => {
      const d = document.querySelector(${JSON.stringify(LIGHTBOX)})
      const img = d?.querySelector('img')
      return !!img && img.complete && img.naturalWidth > 0
    })()`)
    mark('a3', opened && lbShown && lbImg, 'A3 点击缩略图 → 全屏 Lightbox 原图', '')

    // ---- A4: Escape 关闭 Lightbox ----
    const escSent = await js(win, `(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return true
    })()`)
    const lbGone = await waitFor(win, `!document.querySelector(${JSON.stringify(LIGHTBOX)})`, 6000)
    mark('a4', escSent && lbGone, 'A4 Escape 关闭 Lightbox')

    // ---- A5: 合成拖拽 → DropOverlay 出现 ----
    const dragEntered = await js(win, `(() => {
      const dt = new DataTransfer()
      const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_B64)}), c => c.charCodeAt(0))
      dt.items.add(new File([bytes], 'probe.png', { type: 'image/png' }))
      document.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }))
      return true
    })()`)
    const overlayShown = await waitFor(win, `(() => {
      const s = document.querySelector('[role="status"]')
      return !!s && (s.innerText ?? '').includes('图片拖动到此处即可添加')
    })()`, 6000)
    mark('a5', dragEntered && overlayShown, 'A5 文件拖入 → DropOverlay 全屏覆盖层')

    // ---- A6: drop → AttachmentRail 出现 ----
    const dropped = await js(win, `(() => {
      const dt = new DataTransfer()
      const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_B64)}), c => c.charCodeAt(0))
      dt.items.add(new File([bytes], 'probe.png', { type: 'image/png' }))
      document.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
      return true
    })()`)
    const railShown = await waitFor(win, `(() => {
      const rail = document.querySelector(${JSON.stringify(RAIL)})
      return !!rail && rail.querySelectorAll('img').length >= 1
    })()`, 8000)
    const overlayGone = await js(win, `!document.querySelector('[role="status"]')`)
    mark('a6', dropped && railShown && overlayGone, 'A6 drop → AttachmentRail 缩略图出现,覆盖层消失')

    // ---- A7: 点缩略图 → Lightbox;移除 → rail 清空 ----
    const railOpened = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(RAIL)})?.querySelector('button[title="查看原图"]'); if (!b) return false; b.click(); return true })()`)
    const lbRailShown = await waitFor(win, `!!document.querySelector(${JSON.stringify(LIGHTBOX)})`, 6000)
    await js(win, `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
    await waitFor(win, `!document.querySelector(${JSON.stringify(LIGHTBOX)})`, 6000)
    const removed = await js(win, `(() => {
      const b = document.querySelector(${JSON.stringify(RAIL)})?.querySelector('button[aria-label^="移除图片"]')
      if (!b) return false
      b.click(); return true
    })()`)
    const railGone = await waitFor(win, `!document.querySelector(${JSON.stringify(RAIL)})`, 6000)
    mark('a7', railOpened && lbRailShown && removed && railGone, 'A7 缩略图 → Lightbox;移除 → rail 清空')
  } else {
    // ---- real:只读 ----
    const imgReal = await js(win, `!!document.querySelector(${JSON.stringify(IMG_BTN)})`)
    if (imgReal) {
      const openedReal = await js(win, `(() => { const b = document.querySelector(${JSON.stringify(IMG_BTN)}); if (!b) return false; b.click(); return true })()`)
      const lbReal = await waitFor(win, `!!document.querySelector(${JSON.stringify(LIGHTBOX)})`, 6000)
      await js(win, `(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`)
      mark('a2', openedReal && lbReal, 'A2 real:历史图片 → Lightbox 打开验证(只读)')
    } else {
      mark('a2', true, 'A2 real:无历史图片,跳过')
    }
    for (const id of ['a3', 'a4', 'a5', 'a6', 'a7']) mark(id, true, `${id} real 只读,不注入拖拽`)
  }

  mark('a8', errors.length === 0, 'A8 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `attachment-${tag}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `attachment-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `attachment-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 附件探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('ATTACHMENT PROBE FAILED', err); app.exit(1) })
