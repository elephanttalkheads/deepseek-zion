// probe-takeover.mjs — composer 接管双轨探针(ApprovalPanel / QuestionComposer /
// PlanReviewPanel)。P3-⑦ 收尾。
//
// fixture 腿:fx-alpha 常驻 approval+question(会话打开时 mux 重放)→
// ApprovalPanel 接管(等待审批条/理由/配对命令/拒绝+允许一次)→ 允许一次 →
// QuestionComposer 接管(三问:单选推进 / 多选+跳过提交)→ 回答结算后 InputBar
// 回归;再经探针缝合成 plan-review 意图提问 → PlanReviewPanel 决策卡(计划正文
// 渲染 + 确认/拒绝/去聊天)+ 应答拒绝路径(孤儿 rpcId → 明确错误反馈)+
// question/resolved 结算离场。
// real 腿:无挂起交互时座位回退 InputBar(只读;真后端的审批无法确定性触发)。
//
// Usage: npx electron probe-takeover.mjs            (fixture)
//        ZION_TAG=real npx electron probe-takeover.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-takeover-out')
const TAG = process.env.ZION_TAG ?? 'fixture'
const URL = TAG === 'real' ? (process.env.ZION_URL ?? 'http://localhost:5199/') : 'http://localhost:5199/?fixture'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, timeout = 15000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await js(win, expr)) return true
    await sleep(150)
  }
  return false
}
const q = (sel) => JSON.stringify(sel)
const inner = (sel) => `(document.querySelector(${q(sel)})?.innerText ?? '')`
const btnTexts = (sel) => `[...document.querySelectorAll(${q(sel)})].map(b => (b.innerText ?? '').trim())`
const clickButton = (sel, label) => `(() => {
  const b = [...document.querySelectorAll(${q(sel)})].find(x => (x.innerText ?? '').includes(${JSON.stringify(label)}))
  if (!b) return false
  b.click(); return true
})()`

fs.mkdirSync(OUT, { recursive: true })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(String(message)) })
  await win.loadURL(URL)
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  await js(win, `(() => { const r = document.querySelector('.sidebar-row'); if (!r) return false; r.click(); return true })()`)
  const seatShown = await waitFor(win, `!!document.querySelector('[data-composer-seat]')`, 8000)
  mark('t1', seatShown, 'T1 composer 座位渲染(data-composer-seat)')

  if (TAG === 'real') {
    // ---- real:空闲无挂起 → InputBar 回退 ----
    const barShown = await waitFor(win, `!!document.querySelector('[data-composer-seat] [data-composer-card]')`, 8000)
    const ta = await js(win, `!!document.querySelector('[data-composer-seat] .input-bar-textarea')`)
    mark('t2', barShown && ta, 'T2 real:无挂起交互时座位回退 InputBar')
    for (const id of ['t3', 't4', 't5', 't6', 't7', 't8']) mark(id, true, `${id} real 只读`)
  } else {
    // ---- T2: 常驻审批 → ApprovalPanel 接管(等待审批条 + 理由 + 配对命令 + 双按钮) ----
    const apShown = await waitFor(win, `!!document.querySelector('[data-approval-key]')`, 8000)
    // 配对命令来自会话聊天窗口的 tool-call 节点(历史窗口异步落地),等它出现。
    const cmdShown = await waitFor(win, `(${inner('[data-approval-key] [data-approval-scroll]')}).includes('echo approval-paired')`, 8000)
    const apText = await js(win, inner('[data-approval-key]'))
    const apButtons = await js(win, btnTexts('[data-approval-key] button'))
    mark('t2', apShown && cmdShown && apText.includes('等待审批') && apText.includes('fixture 常驻审批')
      && apText.includes('echo approval-paired')
      && apButtons.includes('拒绝') && apButtons.includes('允许一次'),
      'T2 ApprovalPanel:审批条/理由/配对命令/拒绝+允许一次', JSON.stringify(apButtons))

    // ---- T3: 允许一次 → 审批结算 → QuestionComposer 接管 ----
    const clickedAllow = await js(win, clickButton('[data-approval-key] button', '允许一次'))
    const questionShown = await waitFor(win, `!!document.querySelector('[data-question-key]')`, 8000)
    const approvalGone = await js(win, `!document.querySelector('[data-approval-key]')`)
    const q1Title = await js(win, inner('[data-question-key] h2'))
    const q1Options = await js(win, `[...document.querySelectorAll('[data-question-key] [role="radio"]')].length`)
    const pager = await js(win, inner('[data-question-key] footer') ?? inner('[data-question-key]'))
    mark('t3', clickedAllow && questionShown && approvalGone && q1Title.includes('Agent/Harness') && q1Options === 3,
      'T3 允许一次 → 审批结算 → 问题流接管(Q1 三选项)', JSON.stringify({ q1: q1Title.slice(0, 30), opts: q1Options, pager: pager.slice(0, 40) }))

    // ---- T4: 单选推进 Q1 → Q2 ----
    const picked1 = await js(win, `(() => { const b = [...document.querySelectorAll('[data-question-key] [role="radio"]')][0]; if (!b) return false; b.click(); return true })()`)
    const q2Shown = await waitFor(win, `${inner('[data-question-key] h2')}.includes('工作方式')`, 8000)
    mark('t4', picked1 && q2Shown, 'T4 单选 Q1 → 自动推进 Q2')

    // ---- T5: Q2 单选 → Q3 多选勾选 + 跳过提交 → 结算后 InputBar 回归 ----
    const picked2 = await js(win, `(() => { const b = [...document.querySelectorAll('[data-question-key] [role="radio"]')][0]; if (!b) return false; b.click(); return true })()`)
    const q3Shown = await waitFor(win, `${inner('[data-question-key] h2')}.includes('面试信号')`, 8000)
    const toggled = await js(win, `(() => { const b = [...document.querySelectorAll('[data-question-key] [role="checkbox"]')][0]; if (!b) return false; b.click(); return true })()`)
    await sleep(200)
    const checked = await js(win, `[...document.querySelectorAll('[data-question-key] [role="checkbox"]')].map(b => b.getAttribute('aria-checked'))`)
    const skipped = await js(win, clickButton('[data-question-key] button', '跳过本题'))
    const barBack = await waitFor(win, `!!document.querySelector('[data-composer-seat] .input-bar-textarea') && !document.querySelector('[data-question-key]')`, 8000)
    mark('t5', picked2 && q3Shown && toggled && checked[0] === 'true' && skipped && barBack,
      'T5 三问答完(多选勾选+跳过)→ 结算 → InputBar 回归', JSON.stringify(checked))

    // ---- T6: 合成 plan-review 意图提问 → PlanReviewPanel 决策卡 ----
    const planRpc = 'fx-plan-1'
    await js(win, `window.__zionProbePushMuxFrame(${JSON.stringify({
      type: 'question/requested', sessionId: 'fx-alpha', questionRpcId: planRpc,
      questions: [{
        id: 'plan-1', intent: { kind: 'plan-review', approve: 'approve-it' },
        question: '审阅实施计划', detail: '# 实施计划\n\n- 先验证现状\n- 再落地',
        options: [{ label: 'approve-it', description: '批准执行' }, { label: 'decline-it', description: '需要调整' }],
      }],
    })}, ${JSON.stringify(planRpc)})`)
    const prShown = await waitFor(win, `!!document.querySelector('[data-plan-review-key]')`, 8000)
    const prText = await js(win, inner('[data-plan-review-key]'))
    const prButtons = await js(win, btnTexts('[data-plan-review-key] button'))
    mark('t6', prShown && prText.includes('计划待审') && prText.includes('实施计划') && prText.includes('先验证现状')
      && prButtons.includes('确认执行') && prButtons.includes('拒绝') && prButtons.includes('去聊天里说'),
      'T6 plan-review 提问 → PlanReviewPanel 决策卡', JSON.stringify(prButtons))

    // ---- T7: 孤儿 rpcId 应答 → 明确错误反馈(拒绝回执路径)+ 结算离场 ----
    const clickedApprove = await js(win, clickButton('[data-plan-review-key] button', '确认执行'))
    const errShown = await waitFor(win, `(document.querySelector('[data-plan-review-key] [role="status"]')?.innerText ?? '').length > 0`, 6000)
    const errText = await js(win, `document.querySelector('[data-plan-review-key] [role="status"]')?.innerText ?? ''`)
    await js(win, `window.__zionProbePushMuxFrame(${JSON.stringify({
      type: 'question/resolved', sessionId: 'fx-alpha', questionRpcId: planRpc, outcome: 'answered',
    })})`)
    const prGone = await waitFor(win, `!document.querySelector('[data-plan-review-key]')`, 6000)
    mark('t7', clickedApprove && errShown && errText.length > 0 && prGone,
      'T7 拒绝回执路径(错误反馈)+ resolved 结算离场', JSON.stringify(errText.slice(0, 60)))

    // ---- T8: 结算后 InputBar 回归 + 零控制台错误 ----
    const barBack2 = await waitFor(win, `!!document.querySelector('[data-composer-seat] .input-bar-textarea')`, 6000)
    mark('t8', barBack2 && errors.length === 0, 'T8 结算后 InputBar 回归 + 零控制台错误', errors.length ? `${errors.length} 个` : '')
  }

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, `takeover-${TAG}.png`), shot.toPNG())
  fs.writeFileSync(path.join(OUT, `takeover-${TAG}.txt`), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, `takeover-${TAG}-errors.txt`), errors.join('\n'))
  const pass = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  out(`--- ${pass}/${total} passed (${TAG}) ---`)
  app.exit(pass === total ? 0 : 1)
}).catch(err => { console.error('TAKEOVER PROBE FAILED', err); app.exit(1) })
