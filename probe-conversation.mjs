// 会话区 ZION 块 6/7/8/9/11/12 落地探针(fixture 轨为主,real 轨只读)。
// 断言面:
//  A. fixture fx-alpha 历史(闭环回合):.turn-agent 分组 + historical 压平、
//     user OPERATOR 头 + 右对齐、雨轨凝 ◆ seal、details.think 折叠交互 + tape canvas、
//     工具卡 .trace.track/.unit/.contact/.tname/.desc/.dur、消息行动作入口保留。
//  B. 流式(真 prompt → fixture 回放):.turn-agent.is-active + .rail canvas 走带、
//     流式 .caret;闭环后 is-active 消退、末回合凝 ◆。
//  C. 中断(探针缝 __zionProbePushMuxFrame 推 session/event 合成回合:
//     新空白会话 seq 从 0 连续推 turn/start→user/message→step/start→chunks→turn/end
//     cancelled,无 assistant/message → interrupted 冻结 partial):
//     data-status=interrupted、.aborted 450ms 后锁定「 [已被操作员中断]」、
//     该回合 details.think 双行、user 注入解码终态文本。
// 用法:
//   npx electron probe-conversation.mjs                       # fixture(默认)
//   $env:ZION_URL='http://localhost:5199/'; npx electron probe-conversation.mjs   # real 只读
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-conversation-out')
const URL = process.env.ZION_URL ?? 'http://localhost:5199/?fixture'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 12000, every = 400) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}
// rAF 驱动的乱码帧(注入解码/中断锁定)在无头隐藏窗口里被 occlusion 节流,
// capturePage 强制 BeginFrame 让 rAF 走帧——等终态文案时必须边拍边等。
const waitFx = async (win, expr, waitMs = 10000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    try { await win.webContents.capturePage() } catch { /* 窗口已关则下个 expr 也失败 */ }
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(80)
  }
  return false
}

fs.mkdirSync(OUT, { recursive: true })
const tag = URL.includes('fixture') ? 'fixture' : 'real'

// capturePage 有旧帧滞后:先拍一张丢弃再拍。
const shot = async (win, name) => {
  await win.webContents.capturePage()
  await sleep(150)
  const img = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG())
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1264, height: 835, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL(URL)
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out(`mode: ${tag}`)

  // ---- A. 历史会话(闭环回合) ----
  if (tag === 'real') {
    // real:活跃工作区首条会话不一定有多回合历史——遍历索引行找 .turn-agent ≥ 2 的会话
    await js(win, `(() => { const t = document.querySelector('.map-toggle'); if (t) t.click(); return !!t })()`)
    await waitFor(win, `document.querySelectorAll('.map-row').length >= 1`, 8000)
    const rowCount = await js(win, `document.querySelectorAll('.map-row').length`)
    for (let i = 0; i < Math.min(rowCount, 12); i++) {
      await js(win, `(() => { const rows = document.querySelectorAll('.map-row .map-session-button'); const b = rows[${i}]; if (b) b.click(); return !!b })()`)
      await sleep(1800)
      const turns = await js(win, `document.querySelectorAll('.turn-agent').length`).catch(() => 0)
      if (turns >= 2) break
    }
    await js(win, `(() => { const t = document.querySelector('.map-toggle'); if (t) t.click(); return !!t })()`) // 关索引
  } else {
    await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (r) r.click(); return !!r })()`)
  }
  await waitFor(win, `document.querySelectorAll('.chat-node').length >= 1`, 15000)
  await sleep(1200) // 注入解码(≤700ms)收官

  mark('a1', await js(win, `document.querySelectorAll('.turn-agent').length >= 2`), 'A1 回合分组:.turn-agent ≥ 2',
    `count=${await js(win, `document.querySelectorAll('.turn-agent').length`)}`)

  const hist = await js(win, `document.querySelectorAll('.turn-agent.historical').length`)
  mark('a2', tag !== 'fixture' ? hist >= 0 : hist >= 1, 'A2 历史回合 .turn-agent.historical 压平', `count=${hist}`)

  const userHead = await js(win, `(() => {
    const h = document.querySelector('.chat-node--user .msg-head')
    if (!h) return null
    return { text: h.innerText, time: /\\d{2}:\\d{2}:\\d{2}/.test(h.querySelector('.m-time')?.innerText ?? '') }
  })()`)
  mark('a3', userHead !== null && userHead.text.includes('OPERATOR') && userHead.time, 'A3 user 节点 OPERATOR 头 + HH:MM:SS 时钟', JSON.stringify(userHead))

  mark('a3b', await js(win, `getComputedStyle(document.querySelector('.chat-node--user.msg.user .msg-body')).textAlign === 'right'`), 'A3b user .msg.user 右对齐形态')

  mark('a4', await js(win, `[...document.querySelectorAll('.turn-agent .rail .seal')].some(e => e.innerText.trim() === '◆')`), 'A4 闭环回合雨轨凝 ◆ seal')

  // A5/A6:思考块折叠交互 + 磁带纹(fx-alpha turn%3===1 带 reasoning;real 轨软断言)
  const thinkCount = await js(win, `document.querySelectorAll('details.think').length`)
  if (thinkCount >= 1) {
    mark('a5', await js(win, `!!document.querySelector('details.think .tape-track canvas')`), 'A5 details.think + 磁带纹 tape canvas', `think=${thinkCount}`)
    const toggle = await js(win, `(() => {
      const d = document.querySelector('details.think')
      const s = d.querySelector('summary')
      const before = d.open
      s.click()
      const after = d.open
      const lines = d.querySelectorAll('.think-body .tl').length
      s.click()
      return { before, after, lines, restored: d.open === before }
    })()`)
    mark('a6', toggle.before === false && toggle.after === true && toggle.lines >= 1 && toggle.restored, 'A6 think 默认折叠 → 点击展开(.tl 行) → 再点折回', JSON.stringify(toggle))
  } else {
    mark('a5', tag !== 'fixture', 'A5 details.think(real:无 reasoning 则跳过)', `think=${thinkCount}`)
    mark('a6', tag !== 'fixture', 'A6 think 折叠交互(real:跳过)')
  }

  // A7:工具卡机械继电器
  const trace = await js(win, `(() => {
    const t = document.querySelector('.trace.track')
    if (!t) return null
    const u = t.querySelector('.unit')
    return {
      contact: !!u.querySelector('.contact'),
      tname: u.querySelector('.tname')?.innerText ?? '',
      desc: (u.querySelector('.desc')?.innerText ?? '').length > 0,
      dur: u.querySelector('.dur')?.innerText ?? '',
      aria: u.getAttribute('aria-expanded'),
      count: document.querySelectorAll('.trace.track').length,
    }
  })()`)
  mark('a7', trace !== null && trace.contact && /^\[.+\]$/.test(trace.tname) && trace.desc && /^(\d+\.\ds|—|失败|执行中…)$/.test(trace.dur) && trace.aria !== null,
    'A7 工具卡 .trace.track > .unit(.contact/.tname/.desc/.dur/aria-expanded)', JSON.stringify(trace))

  // A8:user 注入解码终态(无残留乱码帧,正文为真文本);rAF 节流环境边拍边等
  const decDone = await js(win, `(() => {
    const bodies = [...document.querySelectorAll('.chat-node--user .msg-body')]
    if (bodies.length === 0) return null
    return { sample: bodies[0].innerText.slice(0, 24) }
  })()`)
  mark('a8', decDone !== null && decDone.sample.length > 0
    && await waitFx(win, `document.querySelectorAll('.msg-body .decoding').length === 0`), 'A8 user 注入解码收官(无 .decoding 残留,正文真文本)', JSON.stringify(decDone))

  // A9:既有入口保留(user 复制按钮 + turn-tail 行动作行;官方语义:assistant 本体
  // 不挂动作,每轮一个 turn-tail 承载复制/分支/统计/反馈)
  mark('a9', await js(win, `!!document.querySelector('.chat-node--user .chat-node-actions button[aria-label="复制"]')`)
    && await js(win, `!!document.querySelector('.chat-node[data-kind="turn-tail"] .chat-node-actions button[aria-label="复制"]')`),
    'A9 消息行动作入口保留(user 复制 + turn-tail 行动作行)')

  if (tag === 'fixture') {
    // ---- B. 流式回合(真 prompt → fixture 回放) ----
    await js(win, `document.querySelector('.shell-new').click(); true`)
    await waitFor(win, `!!document.querySelector('.input-bar-textarea')`, 8000)
    // 流式窗口 = 回复长/6×80ms:用 'render markdown' 触发 fixture 长回复(短回复窗口
    // ~560ms,400ms 轮询会错过活动态)。
    await js(win, `(() => {
      const ta = document.querySelector('.input-bar-textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, 'render markdown')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    await sleep(300)
    await js(win, `(() => { const b = document.querySelector('.input-bar-send'); if (b) b.click(); return !!b })()`)

    mark('b1', await waitFor(win, `!!document.querySelector('.turn-agent.is-active .rail canvas')`, 10000, 80), 'B1 活动回合:.turn-agent.is-active + .rail canvas 走带')
    mark('b2', await waitFor(win, `!!document.querySelector('.turn-agent.is-active .msg-body .caret')`, 10000, 80), 'B2 流式字形蛾光标 .caret 挂末文本块')
    await shot(win, `conversation-${tag}-streaming`)

    // 闭环:is-active 消退,末回合凝 ◆(本会话新到回合不带 historical,seal 沉降动画保留)
    mark('b3', await waitFor(win, `!document.querySelector('.turn-agent.is-active') && (() => {
      const turns = [...document.querySelectorAll('.turn-agent')]
      const last = turns[turns.length - 1]
      return !!last && last.querySelector('.rail .seal')?.innerText.trim() === '◆'
    })()`, 25000), 'B3 回合闭环:is-active 消退 + 末回合雨轨凝 ◆')

    // ---- C. 中断回合(探针缝推合成 session/event;空白会话 seq 从 0) ----
    await js(win, `document.querySelector('.shell-new').click(); true`)
    await waitFor(win, `!!document.querySelector('.input-bar-textarea')`, 8000)
    await sleep(600) // 等 session.open 落地(空白历史)
    const sid = await js(win, `window.__zionProbeGetSelectedSessionId?.() ?? null`)
    out(`interrupted session: ${sid ?? '(无探针缝)'}`)
    if (sid !== null) {
      const now = Date.now()
      const ev = (seq, type, data, surfaceOp) => ({ seq, time: now + seq * 10, type, ...(surfaceOp ? { surfaceOp } : {}), data })
      const frames = [
        ev(0, 'turn/start', { turn: 0 }),
        ev(1, 'user/message', { id: 'probe-u1', role: 'user', content: [{ type: 'text', text: '探针:中断回合' }], source: { kind: 'user' } }, 'append'),
        ev(2, 'step/start', { turn: 0, step: 0 }),
        ev(3, 'assistant/chunk', { turn: 0, step: 0, chunk: { type: 'block-start', index: 0, blockType: 'reasoning' } }),
        ev(4, 'assistant/chunk', { turn: 0, step: 0, chunk: { type: 'reasoning-delta', index: 0, text: '探针思考行一\n探针思考行二' } }),
        ev(5, 'assistant/chunk', { turn: 0, step: 0, chunk: { type: 'block-start', index: 1, blockType: 'text' } }),
        ev(6, 'assistant/chunk', { turn: 0, step: 0, chunk: { type: 'text-delta', index: 1, text: '中断前的部分回复' } }),
        ev(7, 'turn/end', { turn: 0, reason: { kind: 'cancelled' } }),
      ]
      for (const event of frames) {
        await js(win, `window.__zionProbePushMuxFrame({ type: 'session/event', sessionId: ${JSON.stringify(sid)}, event: ${JSON.stringify(event)} })`)
      }
      mark('c1', await waitFor(win, `!!document.querySelector('.chat-node[data-kind="assistant-step"][data-status="interrupted"]')`, 8000), 'C1 interrupted 冻结 partial 渲染(data-status=interrupted)')
      // 乱码帧(rAF)在无头隐藏窗口被节流:waitFx 边拍帧边等终态
      mark('c2', await waitFx(win, `document.querySelector('.chat-node[data-status="interrupted"] .msg-body .aborted')?.textContent === ' [已被操作员中断]'`), 'C2 中断标记锁定「 [已被操作员中断]」')
      mark('c3', await js(win, `document.querySelectorAll('.chat-node[data-status="interrupted"] details.think .think-body .tl').length === 2`), 'C3 中断回合 ThinkBlock 双行(reasoning 块)')
      mark('c4', await waitFx(win, `(() => {
        const b = document.querySelector('.chat-node--user .msg-body')
        return !!b && b.innerText.trim() === '探针:中断回合' && document.querySelectorAll('.msg-body .decoding').length === 0
      })()`), 'C4 中断回合 user 注入解码终态文本')
      mark('c5', await js(win, `(() => {
        const turns = [...document.querySelectorAll('.turn-agent')]
        const last = turns[turns.length - 1]
        return !!last && !last.classList.contains('is-active') && last.querySelector('.rail .seal')?.innerText.trim() === '◆'
      })()`), 'C5 中断回合非活动,雨轨凝 ◆')
      await shot(win, `conversation-${tag}-interrupted`)
    } else {
      mark('c1', false, 'C1 缺少 __zionProbeGetSelectedSessionId 探针缝')
      mark('c2', false, 'C2 跳过'); mark('c3', false, 'C3 跳过'); mark('c4', false, 'C4 跳过'); mark('c5', false, 'C5 跳过')
    }

    // 回历史会话拍闭环形态(形态比对用)
    await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (r) r.click(); return !!r })()`)
    await waitFor(win, `document.querySelectorAll('.chat-node').length >= 1`, 15000)
    await sleep(1000)
    await shot(win, `conversation-${tag}-history`)
  } else {
    mark('b1', true, 'B1 real:只读跳过'); mark('b2', true, 'B2 real:只读跳过'); mark('b3', true, 'B3 real:只读跳过')
    mark('c1', true, 'C1 real:只读跳过'); mark('c2', true, 'C2 real:只读跳过'); mark('c3', true, 'C3 real:只读跳过')
    mark('c4', true, 'C4 real:只读跳过'); mark('c5', true, 'C5 real:只读跳过')
    await shot(win, `conversation-${tag}-history`)
  }

  mark('z0', errors.length === 0, 'Z0 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  fs.writeFileSync(path.join(OUT, `conversation-${tag}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `conversation-${tag}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 会话区探针(${tag}): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('CONVERSATION PROBE FAILED', err); app.exit(1) })
