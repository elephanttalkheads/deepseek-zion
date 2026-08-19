// 真后端专属项核验 probe — 对 3080 真后端逐项真机核验(经 5199 replica 的 /api 代理):
//   A. 模型守卫: 核验过程中任何 LLM 调用都落在 opencode-go / deepseek-v4-flash
//      (settings.describe 默认模型 + llm.providers 路由 + llm.models 目录 +
//       session.models 会话选择 = 实际会被调用的 provider/model)。
//   B. settings.describe / update / replace / mutate(no-op 写回,不改状态)。
//   C. credentials.describe / set / unset(临时引用 set→unset,结束恢复)。
//   D. llm.providers / llm.models / llm.discoverModels(注册表路径,不发网络)。
//   E. dynamicCordisRunner(插件 run 通道): inventory + runHostHalf 应答性。
//   F. session.export 下载通道(GET /api/session.export?sessionId=…)。
//   G. session.updateQueue 真后端 queued 排程(prompt queue 模式 + remove)。
//   H. UI 不炸: 全程零控制台错误、侧栏/输入栏存活。
// 用法: npx electron probe-backend-only.mjs
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = process.env.ZION_OUT ?? path.join(__dirname, 'probe-backend-only-out')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const js = (win, expr) => win.webContents.executeJavaScript(expr)
const waitFor = async (win, expr, waitMs = 12000, every = 500) => {
  const t0 = Date.now()
  while (Date.now() - t0 < waitMs) {
    let v = false
    try { v = await js(win, expr) } catch { v = false }
    if (v) return v
    await sleep(every)
  }
  return false
}

/** Wire unary RPC through the replica /api proxy (exact official envelope). */
const WIRE = (win, method, payload) => js(win, `(async () => {
  try {
    const rpcId = crypto.randomUUID()
    const res = await fetch('/api/${method}', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: '${method}', payload: ${JSON.stringify(payload)} }),
    })
    return { http: res.status, full: await res.json() }
  } catch (e) { return { http: 0, error: String(e) } }
})()`)

/** GET channel(下载/SSE 等物理路由)。 */
const GET = (win, pathnameAndQuery) => js(win, `(async () => {
  try {
    const res = await fetch('/api/${pathnameAndQuery}')
    const buf = new Uint8Array(await res.arrayBuffer())
    return {
      http: res.status,
      contentType: res.headers.get('content-type'),
      disposition: res.headers.get('content-disposition'),
      bytes: buf.length,
      head: buf.length >= 2 ? String.fromCharCode(buf[0], buf[1]) : '',
    }
  } catch (e) { return { http: 0, error: String(e) } }
})()`)

const okOf = (r) => r?.full?.result?.ok === true
const valueOf = (r) => r?.full?.result?.value
const errOf = (r) => r?.full?.result?.error
const brief = (v, n = 300) => JSON.stringify(v)?.slice(0, n) ?? String(v)

fs.mkdirSync(OUT, { recursive: true })
for (const f of ['backend-only.json', 'backend-only.txt', 'backend-only-errors.txt']) {
  const p = path.join(OUT, f); if (fs.existsSync(p)) fs.rmSync(p)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL('http://localhost:5199/')
  await waitFor(win, `document.querySelectorAll('.sidebar-row').length >= 1`, 20000)

  const lines = []
  const results = {}
  const details = {}
  const out = (s) => { lines.push(s); console.log(s) }
  const mark = (id, ok, label, note = '') => { results[id] = !!ok; details[id] = `${label}: ${ok ? 'PASS' : 'FAIL'} ${note}`.trim(); out(`${ok ? '✅' : '❌'} ${label} ${note}`.trim()) }

  out(`badge: ${await js(win, `document.querySelector('.shell-badge')?.innerText ?? ''`)}`)
  // 选中一个会话以挂载 InputBar(H1 依赖)
  await js(win, `(() => { const b = document.querySelector('.sidebar-row'); if (b) b.click(); return !!b })()`)
  await sleep(1500)

  // ============ A. 模型守卫: opencode-go / deepseek-v4-flash ============
  out('--- A. 模型守卫 (opencode-go / deepseek-v4-flash) ---')
  const sDescribe = await WIRE(win, 'settings.describe', {})
  const namespaces = okOf(sDescribe) ? valueOf(sDescribe).namespaces : []
  const nsOf = (key) => namespaces.find(n => n.ns === key)
  const admNs = nsOf('agent-default-model')
  out(`settings.describe ok=${okOf(sDescribe)} namespaces=${namespaces.map(n => n.ns).join(', ')}`)
  out(`agent-default-model value=${brief(admNs?.value)}`)
  const adm = admNs?.value
  const admMatch = adm && adm.provider === 'opencode-go' && adm.model === 'deepseek-v4-flash'
  mark('a1', admMatch, 'A1 默认模型 = opencode-go/deepseek-v4-flash', `value=${brief(adm)}`)
  const piNs = nsOf('llm-pi-ai')
  out(`llm-pi-ai value=${brief(piNs?.value)}`)
  const piProv = piNs?.value?.providers
  const provMatch = piProv && Object.keys(piProv).includes('opencode-go')
  mark('a2', provMatch, 'A2 llm-pi-ai 注册 opencode-go 提供方', `providers=${brief(piProv && Object.keys(piProv))}`)

  const llmProviders = await WIRE(win, 'llm.providers', {})
  out(`llm.providers ok=${okOf(llmProviders)}`)
  const provViews = okOf(llmProviders) ? valueOf(llmProviders).providers : []
  out(`providers=${provViews.map(p => `${p.provider}(${p.active ? 'active' : 'idle'})`).join(', ')}`)
  const ogView = provViews.find(p => p.provider === 'opencode-go')
  mark('a3', !!ogView && ogView.active === true, 'A3 llm.providers 中 opencode-go 路由 active', ogView ? `settingsNs=${ogView.settingsNs}` : '')

  const llmModels = await WIRE(win, 'llm.models', {})
  out(`llm.models ok=${okOf(llmModels)}`)
  const groups = okOf(llmModels) ? valueOf(llmModels).groups : []
  const failures = okOf(llmModels) ? valueOf(llmModels).failures : []
  out(`model groups=${groups.map(g => `${g.provider || g.name}:${(g.models || []).length}`).join(', ')} failures=${brief(failures)}`)
  const ogGroup = groups.find(g => (g.provider || g.name) === 'opencode-go')
  const flashInGroup = !!(ogGroup && (ogGroup.models || []).some(m => (m.id || m.model) === 'deepseek-v4-flash'))
  mark('a4', !!ogGroup && flashInGroup, 'A4 llm.models 目录含 opencode-go / deepseek-v4-flash', ogGroup ? `models=${brief((ogGroup.models || []).map(m => m.id || m.model).slice(0, 8))}` : `groups=${brief(groups.map(g => g.provider || g.name))}`)

  // 新建会话 → session.models: 该会话实际将调用的 provider/model
  const createRes = await WIRE(win, 'session.create', {})
  const sessionId = okOf(createRes) ? createRes.full.result.value.sessionId : null
  mark('a5', !!sessionId, 'A5 session.create(供模型/队列/导出核验)', `id=${sessionId}`)
  let selInfo = null
  if (sessionId) {
    const sModels = await WIRE(win, 'session.models', { sessionId })
    out(`session.models ok=${okOf(sModels)} value=${brief(sModels?.full?.result?.value)}`)
    selInfo = okOf(sModels) ? valueOf(sModels) : null
    const sel = selInfo?.current
    mark('a6', !!sel && sel.provider === 'opencode-go' && sel.model === 'deepseek-v4-flash',
      'A6 会话模型选择 = opencode-go/deepseek-v4-flash(实际调用者)', sel ? brief(sel) : '')
  } else {
    mark('a6', false, 'A6 会话模型选择', '无会话')
  }

  // ============ B. settings.update / replace / mutate ============
  out('--- B. settings 写路径(update/replace/mutate,no-op 写回) ---')
  const writable = namespaces.filter(n => n.writable !== false)
  out(`writable namespaces=${writable.map(n => n.ns).join(', ')}`)
  let target = nsOf('vision-toolkit') && nsOf('vision-toolkit').user ? nsOf('vision-toolkit') : writable.find(n => n.user && typeof n.user === 'object' && Object.keys(n.user).length > 0)
  if (!target) target = writable[0]
  out(`settings target ns=${target?.ns} user=${brief(target?.user, 200)}`)
  const leafPath = (() => {
    if (!target?.user) return null
    const walk = (obj, pre) => {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== null && typeof v === 'object') { const r = walk(v, [...pre, k]); if (r) return r }
        return [...pre, k]
      }
      return null
    }
    return walk(target.user, [])
  })()
  out(`leaf path=${brief(leafPath)}`)
  const nsName = target?.ns
  let b1 = false, b2 = false, b3 = false
  if (nsName && leafPath) {
    const leafVal = leafPath.reduce((o, k) => o?.[k], target.user)
    const patchObj = leafPath.slice(0, -1).reduceRight((o, k) => ({ [k]: o }), { [leafPath[leafPath.length - 1]]: leafVal })
    const m1 = await WIRE(win, 'settings.mutate', { ns: nsName, ops: [{ op: 'set', path: leafPath, value: leafVal }] })
    b1 = okOf(m1)
    mark('b1', b1, 'B1 settings.mutate set(同值 no-op)', `ns=${nsName} path=${brief(leafPath)} ${errOf(m1) ? `err=${brief(errOf(m1))}` : ''}`)
    const m2 = await WIRE(win, 'settings.update', { ns: nsName, patch: patchObj })
    b2 = okOf(m2)
    mark('b2', b2, 'B2 settings.update 合并 patch(同值 no-op)', errOf(m2) ? `err=${brief(errOf(m2))}` : '')
    if (target.user && typeof target.user === 'object') {
      const m3 = await WIRE(win, 'settings.replace', { ns: nsName, section: target.user })
      b3 = okOf(m3)
      mark('b3', b3, 'B3 settings.replace 整段写回(与 user 层一致)', errOf(m3) ? `err=${brief(errOf(m3))}` : '')
    } else {
      out('⚠ B3 跳过: 该命名空间无 user 层(不冒重置风险)')
      results['b3'] = true; details['b3'] = 'B3 settings.replace: SKIP(无 user 层)'
    }
  } else {
    mark('b1', false, 'B1 settings.mutate', '无可写命名空间/叶子键')
    mark('b2', false, 'B2 settings.update', '同上')
    mark('b3', false, 'B3 settings.replace', '同上')
  }
  // 状态未变复核
  const sDescribe2 = await WIRE(win, 'settings.describe', {})
  const ns2 = okOf(sDescribe2) ? valueOf(sDescribe2).namespaces.find(n => n.ns === nsName) : null
  const unchanged = !ns2 || brief(ns2.value) === brief(nsOf(nsName)?.value) || nsName === null
  mark('b4', unchanged, 'B4 写回后 settings 状态与写前一致(无副作用)', nsName ? `ns=${nsName}` : '')

  // ============ C. credentials.describe / set / unset ============
  out('--- C. credentials describe/set/unset ---')
  const cRefs = ['OPENCODE_GO_API_KEY', 'DEEPSEEK_API_KEY', 'ZION_PROBE_SCRATCH']
  const c1 = await WIRE(win, 'credentials.describe', { refs: cRefs })
  const cViews = okOf(c1) ? valueOf(c1).credentials : {}
  out(`describe views=${brief(cViews)}`)
  mark('c1', okOf(c1) && Object.keys(cViews).length === cRefs.length, 'C1 credentials.describe(批量,含真实引用)', errOf(c1) ? `err=${brief(errOf(c1))}` : '')
  const scratchWritable = cViews['ZION_PROBE_SCRATCH']?.writable === true
  mark('c2', okOf(c1) && scratchWritable, 'C2 临时引用 ZION_PROBE_SCRATCH 可写(file 层)', `view=${brief(cViews['ZION_PROBE_SCRATCH'])}`)
  const c3 = await WIRE(win, 'credentials.set', { ref: 'ZION_PROBE_SCRATCH', value: `zion-probe-${Date.now()}` })
  mark('c3', okOf(c3), 'C3 credentials.set 写入临时引用', errOf(c3) ? `err=${brief(errOf(c3))}` : '')
  const c4 = await WIRE(win, 'credentials.describe', { refs: ['ZION_PROBE_SCRATCH'] })
  const scratchSet = okOf(c4) && valueOf(c4).credentials['ZION_PROBE_SCRATCH']?.configured === true
  mark('c4', scratchSet, 'C4 set 后 describe 确认 configured=true')
  const c5 = await WIRE(win, 'credentials.unset', { ref: 'ZION_PROBE_SCRATCH' })
  mark('c5', okOf(c5), 'C5 credentials.unset(幂等清理)', errOf(c5) ? `err=${brief(errOf(c5))}` : '')
  const c6 = await WIRE(win, 'credentials.describe', { refs: ['ZION_PROBE_SCRATCH'] })
  const scratchGone = okOf(c6) && valueOf(c6).credentials['ZION_PROBE_SCRATCH']?.configured === false
  mark('c6', scratchGone, 'C6 unset 后 describe 确认 configured=false(已恢复)')

  // ============ D. llm.discoverModels ============
  out('--- D. llm.discoverModels(注册表路径,不发网络) ---')
  const discNs = ogView?.settingsNs ?? piNs?.ns ?? 'llm-pi-ai'
  const d1 = await WIRE(win, 'llm.discoverModels', { settingsNs: discNs, provider: 'opencode-go' })
  mark('d1', okOf(d1), 'D1 llm.discoverModels(settingsNs + provider 注册表路径)', okOf(d1) ? `models=${brief(valueOf(d1).models?.slice(0, 6))}` : `err=${brief(errOf(d1))}`)

  // ============ E. dynamicCordisRunner(插件 run 通道) ============
  out('--- E. dynamicCordisRunner(插件 run 通道) ---')
  const inv = await js(win, `(async () => {
    try {
      const rpcId = crypto.randomUUID()
      const res = await fetch('/api/dynamicCordisRunner/inventory', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method: 'dynamicCordisRunner/inventory', payload: { args: {} } }),
      })
      return { http: res.status, full: await res.json() }
    } catch (e) { return { http: 0, error: String(e) } }
  })()`)
  out(`inventory response=${brief(inv)}`)
  mark('e1', inv.http === 200 && inv.full?.result?.ok === true, 'E1 dynamicCordisRunner.inventory 应答', inv.http !== 200 ? `http=${inv.http}` : `count=${Array.isArray(inv.full?.result?.value) ? inv.full.result.value.length : '?'}`)
  const runHalf = await js(win, `(async () => {
    try {
      const rpcId = crypto.randomUUID()
      const res = await fetch('/api/dynamicCordisRunner/runHostHalf', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method: 'dynamicCordisRunner/runHostHalf', payload: { args: { agentId: 'no-such-agent', pluginId: 'probe-plugin', packageId: 'probe-pkg', mode: 'run', requestId: 'probe-request', approveFutureVersions: false } } }),
      })
      return { http: res.status, full: await res.json() }
    } catch (e) { return { http: 0, error: String(e) } }
  })()`)
  out(`runHostHalf response=${brief(runHalf)}`)
  const runHalfSane = runHalf.http === 200 && (runHalf.full?.result?.ok === true || runHalf.full?.result?.error !== undefined)
  mark('e2', runHalfSane, 'E2 dynamicCordisRunner.runHostHalf 通道应答(不存在 agent → 业务错误或 ok,非 404)', runHalf.http !== 200 ? `http=${runHalf.http} ${brief(runHalf.error)}` : brief(runHalf.full?.result, 200))

  // ============ F. session.export 下载通道 ============
  out('--- F. session.export 下载通道(GET) ---')
  if (sessionId) {
    const exp = await GET(win, `session.export?sessionId=${encodeURIComponent(sessionId)}`)
    out(`export response=${brief(exp)}`)
    const zipish = exp.http === 200 && exp.bytes > 0 && (exp.head === 'PK' || /zip|octet|stream/i.test(exp.contentType ?? ''))
    mark('f1', zipish, 'F1 GET /api/session.export 下载 ZIP', `http=${exp.http} ct=${exp.contentType} bytes=${exp.bytes} head=${exp.head} ${exp.disposition ?? ''}`)
  } else {
    mark('f1', false, 'F1 GET /api/session.export', '无会话')
  }
  const f2 = await GET(win, 'session.export')
  mark('f2', f2.http === 400, 'F2 缺 sessionId → 400', `http=${f2.http}`)
  const f3 = await GET(win, `session.export?sessionId=${encodeURIComponent('00000000-0000-4000-8000-000000000000')}`)
  mark('f3', f3.http === 404, 'F3 未知 session → 404', `http=${f3.http}`)

  // ============ G. session.updateQueue 真后端 queued 排程 ============
  out('--- G. session.updateQueue 真后端 queued 排程(含真实 LLM 回合) ---')
  let queuedItemId = null
  let g1Attempt = null
  if (sessionId) {
    // session/queue 快照经 mux **WebSocket** 推送(真后端拒绝 SSE GET,426 upgrade required)。
    // 队列项在上一回合结束时会被立即认领(splice),存活窗口可能极短;故:
    //   - turn#1 刻意拉长(长文本输出、不调工具),让 prompt#2 的 queued 项长时间挂起;
    //   - watcher 在帧到达的同一时刻就地发 remove,并对新出现的 pending 项最多重试 3 次。
    const watcherStarted = await js(win, `(() => {
      if (window.__zionQueueWatcher) window.__zionQueueWatcher.cancel?.()
      const want = ${JSON.stringify(sessionId)}
      const frames = []
      const attempts = []
      const attemptedIds = new Set()
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 16000)
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(proto + '//' + location.host + '/api/events.mux')
      const p = new Promise((resolve) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          try { ws.close() } catch { /* noop */ }
          resolve({ frames, attempts })
        }
        ws.onmessage = (ev) => {
          let msg
          try { msg = JSON.parse(ev.data) } catch { return }
          if (msg && msg.method === 'session/queue' && msg.payload && msg.payload.sessionId === want) {
            const items = msg.payload.items ?? []
            frames.push({ at: Date.now(), items })
            const pend = items.find(it => (it.placement === 'queued' || it.placement === 'steering') && !attemptedIds.has(it.id))
            if (pend && attempts.length < 3) {
              attemptedIds.add(pend.id)
              const rpcId = crypto.randomUUID()
              const entry = { itemId: pend.id, at: Date.now(), result: null, resultAt: null, error: null }
              attempts.push(entry)
              fetch('/api/session.updateQueue', {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ type: 'client-request', rpcId, method: 'session.updateQueue', payload: { sessionId: want, itemId: pend.id, action: { kind: 'remove' } } }),
              }).then(r => r.json()).then(full => { entry.result = full.result ?? null; entry.resultAt = Date.now() }).catch(e => { entry.error = String(e); entry.resultAt = Date.now() })
            }
          }
        }
        ws.onerror = () => { if (attempts.length === 0) attempts.push({ error: 'ws-error' }); finish() }
        ws.onclose = () => finish()
        ctrl.signal.addEventListener('abort', finish, { once: true })
      })
      p.cancel = () => { clearTimeout(timer); ctrl.abort() }
      window.__zionQueueWatcher = p
      return 'started'
    })()`)
    out(`queue watcher started: ${watcherStarted}`)

    const p1 = await WIRE(win, 'session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: '请写一篇约 300 字的中文短文,主题是「秋天的夜晚」,分成三段输出,不要调用任何工具,直接输出正文。' }], clientTimeZone: 'UTC' })
    out(`prompt#1 ok=${okOf(p1)} ${errOf(p1) ? `err=${brief(errOf(p1))}` : ''}`)
    await sleep(1500)
    const p2 = await WIRE(win, 'session.prompt', { sessionId, mode: 'queue', content: [{ type: 'text', text: '第二条排队消息(仅核验队列,请勿回答)。' }], clientTimeZone: 'UTC' })
    out(`prompt#2 ok=${okOf(p2)} ${errOf(p2) ? `err=${brief(errOf(p2))}` : ''}`)
    await sleep(2000)

    // 等待 watcher 窗口收束(至多 16s;期间已就地尝试 remove)
    const { frames: qFrames, attempts: qAttempts } = await js(win, `window.__zionQueueWatcher`)
    out(`queue snapshots: ${qFrames.length}`)
    for (const [i, f] of (qFrames ?? []).entries()) {
      out(`  snapshot#${i} items=${brief(f.items.map(it => `${it.placement}:${it.id}`).slice(0, 6), 200)}`)
    }
    for (const [i, a] of (qAttempts ?? []).entries()) {
      out(`  attempt#${i} item=${a.itemId} result=${brief(a.result)} ${a.error ? `error=${a.error}` : ''}`)
    }
    const okAttempt = (qAttempts ?? []).find(a => a.result?.ok === true) ?? null
    const lastAttempt = (qAttempts ?? [])[(qAttempts ?? []).length - 1] ?? null
    const failedAttempts = (qAttempts ?? []).filter(a => a.result?.ok === false).map(a => a.result?.error?.code).join(',')
    queuedItemId = okAttempt?.itemId ?? lastAttempt?.itemId ?? null
    details['g0'] = `attempts=${(qAttempts ?? []).length}` + (okAttempt ? ` ok删除 item=${okAttempt.itemId}` : ` 均未成功(${failedAttempts || '无'})`) + ` 快照=${qFrames.length} 帧`

    mark('g1', !!okAttempt, 'G1 session.updateQueue remove 命中挂起项(真后端)',
      okAttempt ? `item=${okAttempt.itemId}` : (failedAttempts ? `全部 ${qAttempts.length} 次尝试均被认领拦截(${failedAttempts})` : '未触发'))
    const successFrames = okAttempt ? qFrames.filter(f => f.at >= (okAttempt.resultAt ?? okAttempt.at)) : []
    const stillSeen = successFrames.some(f => f.items.some(it => it.id === okAttempt?.itemId))
    mark('g2', okAttempt ? !stillSeen : false, 'G2 remove 应答后该项不再出现在后续 session/queue 快照',
      okAttempt ? (successFrames.length ? `应答后 ${successFrames.length} 帧含该 item=${stillSeen}` : '应答后无后续帧(已消失或回合结束)') : '无成功 remove')

    // durable 事件 + 模型/提供方证据
    const hist = await WIRE(win, 'session.history', { sessionId, maxMessages: 60 })
    out(`history ok=${okOf(hist)} events=${okOf(hist) ? valueOf(hist).events.length : '?'}`)
    if (okOf(hist)) {
      const evts = valueOf(hist).events
      const types = [...new Set(evts.map(e => e.event?.type ?? e.type))].slice(0, 30)
      out(`history event types=${types.join(', ')}`)
      const textBlob = evts.map(e => JSON.stringify(e)).join('\n')
      const errTexts = [...new Set((textBlob.match(/.{0,80}(400|invalid_request_error|tool_count_limit|Console Go|Error from provider).{0,120}/g) ?? []).map(s => s.trim()))].slice(0, 5)
      out(`model/provider evidence in history: ${errTexts.length ? errTexts.join('\n  ') : '(无 400/错误文本)'}`)
      details['g3'] = `history evidence: ${errTexts.length ? errTexts.join(' || ') : 'none'}`
    }
    // 收尾: 取消任何进行中的回合
    await WIRE(win, 'session.cancel', { sessionId })
  } else {
    mark('g1', false, 'G1 session.updateQueue', '无会话')
    mark('g2', false, 'G2 remove 后消失', '无会话')
  }

  // ============ H. UI 不炸 + 零控制台错误 ============
  out('--- H. UI 不炸 ---')
  const h1 = await js(win, `document.querySelectorAll('.sidebar-row').length >= 1 && !!document.querySelector('.input-bar-textarea')`)
  mark('h1', h1, 'H1 侧栏会话行 + 输入栏存活')
  mark('h2', errors.length === 0, 'H2 全程零控制台错误', errors.length ? `${errors.length} 个` : '')

  // save
  const body = await js(win, `document.body.innerText`)
  fs.writeFileSync(path.join(OUT, 'backend-only.json'), JSON.stringify({ results, details, sessionId, selInfo, provViews, namespaces: namespaces.map(n => ({ ns: n.ns, writable: n.writable !== false, applies: n.applies, hasUser: !!n.user })) }, null, 2))
  fs.writeFileSync(path.join(OUT, 'backend-only.txt'), lines.join('\n'))
  fs.writeFileSync(path.join(OUT, 'backend-only-body.txt'), body)
  fs.writeFileSync(path.join(OUT, 'backend-only-errors.txt'), errors.join('\n'))
  const shot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(OUT, 'backend-only.png'), shot.toPNG())

  const pass = Object.values(results).filter(Boolean).length
  const total = Object.keys(results).length
  out(`\n== 真后端专属项核验: ${pass}/${total} pass ==`)
  app.quit()
}).catch(err => { console.error('BACKEND-ONLY PROBE FAILED', err); app.exit(1) })
