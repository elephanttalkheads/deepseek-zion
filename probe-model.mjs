// 模型两级菜单(ModelSelect)探针 — 真后端(新建会话,目录确定完整):
//   触发→根菜单(模型/推理等级)→模型列表(选 deepseek-v4-flash)→触发更新→
//   推理等级(有当前模型后出现)→选一项。全程零错误。
// 用法: npx electron probe-model.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-model-out')
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
  const logs = []
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message)
    else logs.push(`${level}:${message}`)
  })
  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-item').length >= 1`, 20000)

  const lines = []
  const results = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }
  const seat = `'.input-bar-model'`

  // 新建会话(目录确定完整)——经 wire 直建,再点标题含「新会话/Untitled」或最新行
  const created = await js(win, `(async () => {
    const res = await fetch('/api/session.create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session.create', payload: { args: {} } }) })
    const full = await res.json()
    return full.result?.ok === true ? full.result.value.sessionId : null
  })()`)
  out(`created: ${created}`)
  const directModels = await js(win, `(async () => {
    const res = await fetch('/api/session.models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'session.models', payload: { sessionId: ${JSON.stringify(created)} } }) })
    const full = await res.json()
    const v = full.result?.value
    return v ? { ok: full.result.ok, current: v.current, groups: v.groups?.map(g => ({ id: g.id, n: g.models?.length })) } : { ok: full.result.ok, err: full.result.error }
  })()`)
  out(`direct session.models: ${JSON.stringify(directModels)}`)
  await sleep(1500)
  // 选「根级(depth 0)且非运行」的会话行(子代理行拒绝模型 RPC;运行中锁定选择器)
  const selected = await js(win, `(() => {
    const items = [...document.querySelectorAll('.sidebar-item')]
    const rootIdle = items.find(i => parseInt(i.style.paddingLeft || '10', 10) <= 12 && !i.getAttribute('data-running'))
    const row = rootIdle ? rootIdle.querySelector('.sidebar-row') : null
    if (row) { row.click(); return true }
    return false
  })()`)
  out(`root idle row clicked: ${selected}`)
  if (!selected) {
    await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return true })()`)
  }

  const triggerReady = await waitFor(win, `(() => {
    const b = document.querySelector(${seat} + ' button')
    return !!b && !b.disabled && (b.innerText || '').trim() !== ''
  })()`, 12000)
  const triggerText = await js(win, `document.querySelector(${seat} + ' button')?.innerText ?? ''`)
  out(`trigger: ${JSON.stringify(triggerText)}`)
  mark('m1', triggerReady, 'M1 模型席位触发按钮存在(非锁定且含文本)', triggerText || '(空)')

  // 打开根菜单
  await js(win, `document.querySelector(${seat} + ' button')?.click()`)
  await sleep(700)
  const rootText = await js(win, `document.querySelector(${seat})?.innerText ?? ''`)
  out(`root: ${JSON.stringify(rootText.slice(0, 200))}`)
  mark('m2', rootText.includes('模型'), 'M2 根菜单含「模型」行', `含推理等级=${rootText.includes('推理等级')}`)

  // 钻入模型列表
  const toModels = await waitFor(win, `(() => {
    const cont = document.querySelector(${seat})
    const b = cont && [...cont.querySelectorAll('button')].find(x => x.innerText && x.innerText.trim() === '模型')
    if (b) { b.click(); return true } return false
  })()`, 6000)
  await sleep(700)
  const modelList = await js(win, `[...document.querySelectorAll(${seat} + ' button')].map(b => (b.innerText || '').trim()).filter(Boolean)`)
  out(`model pane buttons: ${JSON.stringify(modelList)}`)
  mark('m3', modelList.some(t => t.includes('deepseek-v4-flash') || t.includes('DeepSeek')), 'M3 模型列表渲染含候选模型', modelList.slice(0, 6).join(','))

  // 选 deepseek-v4-flash(或首个非返回项)
  const pickedModel = await js(win, `(() => {
    const cont = document.querySelector(${seat})
    const btns = [...(cont?.querySelectorAll('button') ?? [])]
    const cand = btns.find(b => { const t = (b.innerText || '').trim(); return t.includes('deepseek-v4-flash') || t.includes('DeepSeek V4 Flash') }) ?? btns.find(b => { const t=(b.innerText||'').trim(); return t && t !== '模型' && t !== '←' && !t.includes('推理等级') })
    if (cand) { cand.click(); return (cand.innerText || '').trim().slice(0, 40) }
    return null
  })()`)
  out(`picked: ${pickedModel}`)
  await sleep(900)
  const triggerAfter = await js(win, `document.querySelector(${seat} + ' button')?.innerText ?? ''`)
  mark('m4', pickedModel !== null && triggerAfter !== '' && triggerAfter !== triggerText, 'M4 选择模型后触发更新', `→ ${triggerAfter.slice(0, 60)}`)

  // 推理等级(有当前模型后出现)
  await js(win, `document.querySelector(${seat} + ' button')?.click()`)
  await sleep(700)
  const rootText2 = await js(win, `document.querySelector(${seat})?.innerText ?? ''`)
  const hasEffort = rootText2.includes('推理等级')
  mark('m5', hasEffort, 'M5 根菜单出现「推理等级」行(有当前模型)')
  if (hasEffort) {
    const toEffort = await waitFor(win, `(() => {
      const cont = document.querySelector(${seat})
      const b = cont && [...cont.querySelectorAll('button')].find(x => x.innerText && x.innerText.trim().includes('推理等级'))
      if (b) { b.click(); return true } return false
    })()`, 6000)
    await sleep(700)
    const effortList = await js(win, `[...document.querySelectorAll(${seat} + ' button')].map(b => (b.innerText || '').trim()).filter(Boolean)`)
    out(`effort pane: ${JSON.stringify(effortList)}`)
    const effortPicked = await js(win, `(() => {
      const cont = document.querySelector(${seat})
      const b = [...(cont?.querySelectorAll('button') ?? [])].find(x => /low|high/i.test(x.innerText || ''))
      if (b) { b.click(); return true } return false
    })()`)
    await sleep(900)
    mark('m6', toEffort && effortPicked, 'M6 选择推理等级(selectModel 带 reasoningEffort)', JSON.stringify(effortList.slice(0, 5)))
    // M6b: 独立 mi-think 元素(第二轮微簇;推理等级从触发器拆出,data-level 供 tl-* 等级色)
    const think = await js(win, `(() => { const el = document.querySelector('.input-bar-model-think'); return el ? { text: (el.innerText ?? '').trim(), level: el.getAttribute('data-level') } : null })()`)
    out(`mi-think = ${JSON.stringify(think)}`)
    mark('m6b', think !== null && think.text !== '' && think.level !== null, 'M6b 独立 mi-think 元素(data-level 等级)', JSON.stringify(think))
  } else {
    mark('m6', false, 'M6 无推理等级行可测', '')
    mark('m6b', false, 'M6b 无推理等级行,mi-think 未测', '')
  }

  mark('m7', errors.length === 0, 'M7 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'model-real.png'), shot.toPNG())
  fs.writeFileSync(path.join(OUT, 'model-real.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'model-real-errors.txt'), errors.join('\n'))
  fs.writeFileSync(path.join(OUT, 'model-real-console.txt'), logs.join('\n'))
  out(`\n-- console logs --`)
  for (const l of logs.filter(x => x.includes('model-select')).slice(0, 8)) out(`  ${l}`)
  const pass = Object.values(results).filter(Boolean).length
  out(`\n== 模型菜单探针(real): ${pass}/${Object.keys(results).length} pass ==`)
  app.quit()
}).catch(err => { console.error('MODEL PROBE FAILED', err); app.exit(1) })
