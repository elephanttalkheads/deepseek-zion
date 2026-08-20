// ============================================================
// inspector/page-panel.js — 官方 dsh web 页面内的「组件召唤器」。
// 由 Electron 壳(main.mjs --inspector)在页面 boot 完成后注入执行。
//
// 能力:
//   1. 舞台(overlay):经 window.__DSH_MODULES__ 动态 import 官方 client
//      模块 → 用官方同款 React 实例把真实组件挂载到悬浮舞台(带 mock props)。
//   2. 真实配方(real):驱动官方 UI 真实状态(如 /goal 命令 → 真实 GoalBar)。
//   3. 悬浮面板:搜索 manifest(ui-component-inventory.md 生成)+ 一键召唤。
//   4. window.__zionInspector — 主进程/CLI 调用的 JSON 安全 API。
//
// 类名统一 zion-iv- 前缀,避免污染官方 UI。
// ============================================================
(() => {
  'use strict'
  if (window.__zionInspector) return // 幂等:页面刷新后重注入会覆盖,防双实例

  const MANIFEST = window.__ZION_INSPECTOR_MANIFEST__ || { entries: [] }
  const MODULES = () => window.__DSH_MODULES__
  const STAGE_ID = 'zion-inv-stage'
  const NORM = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  // ---------------- 工具 ----------------
  // 不用 requestAnimationFrame:屏外/隐藏窗口会被节流,rAF 可能永不触发。
  const tick = () => sleep(30).then(() => sleep(30))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  async function waitFor(selector, timeoutMs = 10000) {
    const start = Date.now()
    for (;;) {
      const el = document.querySelector(selector)
      if (el) return el
      if (Date.now() - start > timeoutMs) return null
      await sleep(200)
    }
  }

  function rectOf(el) {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
  }

  /** 多选择器并集矩形(只收可见元素,宽高 > 0)。 */
  function unionRect(selector) {
    const els = [...document.querySelectorAll(selector)].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    if (els.length === 0) return null
    const rs = els.map((el) => el.getBoundingClientRect())
    const x = Math.min(...rs.map((r) => r.x))
    const y = Math.min(...rs.map((r) => r.y))
    const right = Math.max(...rs.map((r) => r.right))
    const bottom = Math.max(...rs.map((r) => r.bottom))
    return { x: Math.round(x), y: Math.round(y), width: Math.round(right - x), height: Math.round(bottom - y), count: els.length }
  }

  /** React 受控 textarea 原生 setter + input 事件(探针同款)。 */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  /** 找 composer 输入框:优先官方 placeholder(Describe/描述),退化为首个可见 textarea。 */
  function pickComposerTextarea() {
    const tas = [...document.querySelectorAll('textarea')]
    const visible = tas.filter((ta) => {
      const r = ta.getBoundingClientRect()
      return r.width > 50 && r.height > 12 && getComputedStyle(ta).visibility !== 'hidden'
    })
    const pref = visible.find((ta) => /describe|build|描述|想构建|输入/i.test(ta.placeholder || ''))
    return pref || visible[0] || null
  }

  function makeT(dict) {
    return (key, params) => {
      let s = dict[key] ?? String(key)
      if (params) for (const [k, v] of Object.entries(params)) s = s.split('{' + k + '}').join(String(v))
      return s
    }
  }

  /** 高亮某个真实元素(截图辅助)。 */
  function flash(selector, ms = 1500) {
    const el = document.querySelector(selector)
    if (!el) return false
    const prev = el.style.outline
    el.style.outline = '2px dashed #ff3b6b'
    setTimeout(() => { el.style.outline = prev }, ms)
    return true
  }

  /** 关掉「内测声明」欢迎弹窗(fixture 模式无法持久化确认,每次都会弹)。 */
  async function dismissWelcomeModal() {
    if (!/内测声明|欢迎|welcome/i.test(document.body.innerText || '')) return false
    const candidates = [...document.querySelectorAll('button')]
    const btn = candidates.find((b) => {
      const txt = (b.textContent || '').trim()
      const r = b.getBoundingClientRect()
      return /^(继续|继续使用|continue)/i.test(txt) && r.width > 0 && r.height > 0
    })
    if (btn) {
      btn.click()
      await sleep(700)
    }
    // fixture 模式无法持久化确认(保存必失败),弹窗会一直盖着 → dev 工具直接摘掉 dialog。
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog && /内测声明|欢迎|welcome/i.test(dialog.textContent || '')) {
      dialog.remove()
      await sleep(300)
    }
    return true
  }

  // ---------------- 舞台 ----------------
  let stageRoot = null // ReactDOM root of the mounted component
  let stageEl = null

  function ensureStage() {
    if (stageEl) return stageEl
    const root = document.createElement('div')
    root.id = STAGE_ID
    root.style.cssText = [
      'position:fixed;inset:0;z-index:2147483000;pointer-events:none;',
      'display:flex;align-items:flex-start;justify-content:center;padding:64px 24px 24px;',
    ].join('')
    root.innerHTML = ''
    const backdrop = document.createElement('div')
    backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(4,10,6,.5);backdrop-filter:blur(2px);'
    const card = document.createElement('div')
    card.className = 'zion-iv-card'
    card.style.cssText = [
      'position:relative;pointer-events:auto;max-width:min(1080px,94vw);max-height:calc(100vh - 100px);',
      'display:flex;flex-direction:column;border:1px solid rgba(120,255,180,.35);border-radius:10px;',
      'background:#0c130d;color:#d8ffe4;font:13px/1.5 ui-monospace,Consolas,monospace;',
      'box-shadow:0 12px 48px rgba(0,0,0,.6);overflow:hidden;',
    ].join('')
    const head = document.createElement('div')
    head.className = 'zion-iv-stage-head'
    head.style.cssText = [
      'display:flex;align-items:center;gap:8px;padding:6px 10px;flex:none;',
      'background:linear-gradient(90deg,#0e2a16,#102015);border-bottom:1px solid rgba(120,255,180,.2);',
      'font-weight:600;letter-spacing:.02em;',
    ].join('')
    head.innerHTML = '<span id="zion-inv-stage-title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9fffc0"></span>'
    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.textContent = '✕ 关闭舞台'
    closeBtn.style.cssText = [
      'background:transparent;border:1px solid rgba(255,120,120,.5);color:#ffb3b3;border-radius:6px;',
      'padding:2px 10px;cursor:pointer;font:inherit;',
    ].join('')
    closeBtn.addEventListener('click', () => closeStage())
    head.appendChild(closeBtn)
    const body = document.createElement('div')
    body.id = 'zion-inv-stage-body'
    body.style.cssText = 'overflow:auto;padding:14px;min-width:320px;'
    card.appendChild(head)
    card.appendChild(body)
    root.appendChild(backdrop)
    root.appendChild(card)
    document.body.appendChild(root)
    stageEl = root
    return stageEl
  }

  function setStageTitle(text) {
    const t = document.getElementById('zion-inv-stage-title')
    if (t) t.textContent = text
  }

  async function closeStage() {
    if (stageRoot) { try { stageRoot.unmount() } catch { /* ignore */ } stageRoot = null }
    if (stageEl) { stageEl.remove(); stageEl = null }
    await tick()
    return { ok: true }
  }

  /**
   * 舞台挂载:import 官方模块 → ReactDOM 挂载真实组件。
   * @returns {Promise<{ok:boolean, selector:string, rect, note}>}
   */
  async function mountOverlay(moduleName, componentName, props) {
    const modules = MODULES()
    if (!modules) throw new Error('window.__DSH_MODULES__ 缺失 —— 页面尚未完成 boot(稍后再试)')
    if (!moduleName || !componentName) throw new Error('需要 module 与 component 名')
    await closeStage()
    const [React, ReactDomClient, mod] = await Promise.all([
      modules.import('react', '', {}),
      modules.import('react-dom/client', '', {}),
      modules.import(moduleName, '', {}),
    ])
    const C = mod && mod[componentName]
    if (typeof C !== 'function') {
      throw new Error(`模块 ${moduleName} 没有可挂载的导出 ${componentName};可用导出: ${Object.keys(mod || {}).join(', ')}`)
    }
    const stage = ensureStage()
    setStageTitle(`${componentName}  @ ${moduleName}`)
    const body = document.getElementById('zion-inv-stage-body')
    body.innerHTML = ''
    const mount = document.createElement('div')
    mount.id = 'zion-inv-mount'
    body.appendChild(mount)
    stageRoot = ReactDomClient.createRoot(mount)
    stageRoot.render(React.createElement(C, props))
    await tick()
    const rect = rectOf(mount) || rectOf(stage)
    return {
      ok: true,
      mode: 'overlay',
      module: moduleName,
      component: componentName,
      selector: '#zion-inv-mount',
      rect,
      stageRect: rectOf(stage),
      note: `已用官方模块 ${moduleName}#${componentName} 挂载(React 同实例)`,
    }
  }

  // ---------------- 配方执行 ----------------
  async function runReal(recipe) {
    if (typeof recipe.run !== 'function') throw new Error('真实配方缺少 run()')
    await dismissWelcomeModal()
    const result = await recipe.run({
      waitFor, rectOf, unionRect, setNativeValue, pickComposerTextarea, flash, sleep, tick, dismissWelcomeModal,
    })
    return { ok: true, mode: 'real', recipeId: recipe.id, ...result }
  }

  async function runOverlay(recipe) {
    const props = typeof recipe.props === 'function' ? recipe.props() : (recipe.props ?? {})
    const r = await mountOverlay(recipe.module, recipe.component, props)
    return { ...r, recipeId: recipe.id }
  }

  // ---------------- 对外 API(JSON 安全) ----------------
  function manifestEntry(idOrName) {
    const q = NORM(idOrName)
    return MANIFEST.entries.find((e) => NORM(e.id) === q || NORM(e.name) === q) || null
  }

  async function summon(idOrName, opts = {}) {
    const recipes = window.__ZION_RECIPES__ || {}
    const q = NORM(idOrName)
    const recipe = recipes[q] || Object.values(recipes).find((r) => NORM(r.id) === q || NORM(r.name) === q) || null
    if (recipe) {
      if (recipe.kind === 'real') return runReal(recipe)
      return runOverlay(recipe)
    }
    const entry = manifestEntry(idOrName)
    if (entry && entry.official && entry.official.module) {
      return mountOverlay(entry.official.module, entry.official.component, opts.props ?? {})
    }
    if (entry) {
      throw new Error(`条目 ${entry.id}(${entry.name}) 暂无 curated 官方映射;可用 raw 召唤: ${entry.official ? '' : '见 cli raw / eval'} `)
    }
    throw new Error(`未找到组件/配方 "${idOrName}"(list 查看全部)`)
  }

  window.__zionInspector = {
    status: () => ({
      ok: true,
      modules: !!MODULES(),
      url: location.href,
      fixture: new URLSearchParams(location.search).has('fixture'),
      recipes: Object.keys(window.__ZION_RECIPES__ || {}),
      manifestEntries: MANIFEST.entries.length,
    }),
    list: () => MANIFEST.entries,
    summon,
    summonRaw: (moduleName, componentName, props) => mountOverlay(moduleName, componentName, props ?? {}),
    recipe: (id) => {
      const q = NORM(id)
      const r = Object.values(window.__ZION_RECIPES__ || {}).find((x) => NORM(x.id) === q || NORM(x.name) === q) || null
      if (!r) throw new Error(`无配方 "${id}"(可用: ${Object.keys(window.__ZION_RECIPES__ || {}).join(', ')})`)
      return r.kind === 'real' ? runReal(r) : runOverlay(r)
    },
    close: closeStage,
    elementRect: (selector) => {
      const el = document.querySelector(selector)
      return el ? { ok: true, selector, rect: rectOf(el) } : { ok: false, error: `selector 无匹配: ${selector}` }
    },
    flash,
    _core: { makeT, rectOf, unionRect, waitFor, setNativeValue, pickComposerTextarea, tick, sleep, dismissWelcomeModal },
  }

  // ---------------- 悬浮面板 ----------------
  function buildPanel() {
    const css = document.createElement('style')
    css.textContent = `
      .zion-iv-l { position:fixed; right:14px; bottom:14px; z-index:2147483001;
        background:#0c130d; color:#9fffc0; border:1px solid rgba(120,255,180,.4);
        border-radius:10px; padding:8px 12px; font:600 13px ui-monospace,Consolas,monospace;
        cursor:pointer; box-shadow:0 6px 24px rgba(0,0,0,.5); letter-spacing:.05em; }
      .zion-iv-l:hover { background:#10241a; }
      #zion-inv-panel { position:fixed; right:14px; top:14px; z-index:2147483001;
        width:400px; max-width:94vw; max-height:calc(100vh - 28px); overflow:auto;
        background:#0a100b; color:#d8ffe4; border:1px solid rgba(120,255,180,.35);
        border-radius:12px; font:12px/1.5 ui-monospace,Consolas,monospace;
        box-shadow:0 12px 48px rgba(0,0,0,.65); display:none; }
      #zion-inv-panel.zion-iv-open { display:block; }
      .zion-iv-ph { display:flex; align-items:center; gap:8px; padding:10px 12px;
        border-bottom:1px solid rgba(120,255,180,.18); position:sticky; top:0;
        background:#0e1a11; }
      .zion-iv-ph input { flex:1; background:#050a06; color:#e4ffef; border:1px solid
        rgba(120,255,180,.3); border-radius:6px; padding:4px 8px; font:inherit; outline:none; }
      .zion-iv-ph button, .zion-iv-row button { background:#12301d; color:#b8ffd4;
        border:1px solid rgba(120,255,180,.35); border-radius:6px; padding:2px 8px;
        cursor:pointer; font:inherit; }
      .zion-iv-ph button:hover, .zion-iv-row button:hover { background:#1a4427; }
      .zion-iv-row { padding:8px 12px; border-bottom:1px solid rgba(120,255,180,.08); }
      .zion-iv-row .nm { font-weight:700; color:#c9ffdd; }
      .zion-iv-row .id { color:#6fae87; font-size:10px; margin-left:6px; }
      .zion-iv-row .mt { color:#7f9a88; font-size:11px; margin-top:2px; }
      .zion-iv-row .acts { margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; }
      .zion-iv-tag { display:inline-block; font-size:10px; border-radius:4px; padding:0 5px;
        margin-left:6px; background:#10301d; color:#8fe6ad; }
      .zion-iv-tag.off { background:#10304a; color:#9fc8ff; }
      .zion-iv-tag.add { background:#302b10; color:#ffd98f; }
      .zion-iv-tag.slot { background:#2a1030; color:#e0a8ff; }
      .zion-iv-raw { padding:8px 12px; border-top:1px solid rgba(120,255,180,.18); background:#0d130f; }
      .zion-iv-raw input, .zion-iv-raw textarea { width:100%; background:#050a06; color:#e4ffef;
        border:1px solid rgba(120,255,180,.3); border-radius:6px; padding:4px 8px; font:inherit;
        margin-bottom:6px; outline:none; }
      .zion-iv-raw textarea { min-height:64px; resize:vertical; }
      .zion-iv-st { padding:6px 12px; font-size:11px; color:#8fe6ad; border-top:1px solid rgba(120,255,180,.12);
        word-break:break-all; max-height:90px; overflow:auto; }
      .zion-iv-st.err { color:#ff9d9d; }
    `
    document.head.appendChild(css)

    const launcher = document.createElement('button')
    launcher.type = 'button'
    launcher.className = 'zion-iv-l'
    launcher.textContent = '⿻ 组件'
    launcher.title = '组件召唤器(呼出官方 UI 组件真实状态)'
    launcher.addEventListener('click', () => { panel.classList.toggle('zion-iv-open') })
    document.body.appendChild(launcher)

    const panel = document.createElement('div')
    panel.id = 'zion-inv-panel'
    panel.innerHTML = `
      <div class="zion-iv-ph">
        <input id="zion-inv-q" placeholder="搜索组件(名称/位置)…" />
        <button id="zion-inv-close">✕</button>
      </div>
      <div id="zion-inv-list"></div>
      <div class="zion-iv-raw">
        <div style="font-weight:700;margin-bottom:6px;color:#9fffc0">原始召唤(raw)</div>
        <input id="zion-inv-rm" placeholder="模块名(如 @deepseek-ai/dsh-client-ui-goal)" />
        <input id="zion-inv-rc" placeholder="组件名(如 GoalBar)" />
        <textarea id="zion-inv-rp" placeholder='props JSON,如 {"goal":{…}} 或留空 {}'></textarea>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="zion-inv-rawgo">召唤</button>
          <button id="zion-inv-cls">关闭舞台</button>
          <button id="zion-inv-shot">全窗截图</button>
        </div>
      </div>
      <div id="zion-inv-st" class="zion-iv-st">就绪:${MANIFEST.entries.length} 个清单条目</div>
    `
    document.body.appendChild(panel)

    const listEl = panel.querySelector('#zion-inv-list')
    const stEl = panel.querySelector('#zion-inv-st')
    const qEl = panel.querySelector('#zion-inv-q')
    const setSt = (text, isErr) => {
      stEl.textContent = text
      stEl.classList.toggle('err', !!isErr)
    }

    function renderRows(filter) {
      const q = NORM(filter)
      listEl.innerHTML = ''
      const rows = MANIFEST.entries.filter((e) => !q || NORM(e.name).includes(q) || NORM(e.id).includes(q) || NORM(e.mount).includes(q))
      if (rows.length === 0) { listEl.innerHTML = '<div class="zion-iv-row" style="color:#7f9a88">无匹配</div>'; return }
      for (const e of rows) {
        const row = document.createElement('div')
        row.className = 'zion-iv-row'
        const tagClass = e.tag === 'official' ? 'off' : e.tag === 'zion-add' ? 'add' : e.tag === 'slot' ? 'slot' : ''
        const mods = e.official?.modes || []
        row.innerHTML = `
          <div><span class="nm"></span><span class="id"></span><span class="zion-iv-tag ${tagClass}"></span></div>
          <div class="mt"></div>
          <div class="acts">
            ${mods.includes('overlay') ? '<button data-act="overlay">舞台</button>' : ''}
            ${mods.includes('real') ? '<button data-act="real">真实</button>' : ''}
            <button data-act="raw">原始</button>
          </div>`
        row.querySelector('.nm').textContent = e.name
        row.querySelector('.id').textContent = e.id
        row.querySelector('.zion-iv-tag').textContent = e.tag
        row.querySelector('.mt').textContent = e.mount || (e.data || '').slice(0, 90)
        row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.act === 'raw') {
            panel.querySelector('#zion-inv-rm').value = e.official?.module || ''
            panel.querySelector('#zion-inv-rc').value = e.official?.component || ''
            panel.querySelector('#zion-inv-rp').value = ''
          } else {
            void summon(e.id, { mode: b.dataset.act }).then(
              (r) => setSt(`✓ ${r.mode} ${r.recipeId || ''} ${JSON.stringify(r.rect)} ${r.note || ''}`),
              (err) => setSt(`✗ ${err.message}`, true),
            )
          }
        }))
        listEl.appendChild(row)
      }
    }
    renderRows('')
    qEl.addEventListener('input', () => renderRows(qEl.value))

    panel.querySelector('#zion-inv-close').addEventListener('click', () => panel.classList.remove('zion-iv-open'))
    panel.querySelector('#zion-inv-cls').addEventListener('click', () => void closeStage().then(() => setSt('舞台已关闭')))
    panel.querySelector('#zion-inv-rawgo').addEventListener('click', () => {
      const m = panel.querySelector('#zion-inv-rm').value.trim()
      const c = panel.querySelector('#zion-inv-rc').value.trim()
      let props = {}
      try { props = JSON.parse(panel.querySelector('#zion-inv-rp').value || '{}') } catch { setSt('props JSON 解析失败', true); return }
      void mountOverlay(m, c, props).then(
        (r) => setSt(`✓ ${JSON.stringify(r.rect)} ${r.note}`),
        (err) => setSt(`✗ ${err.message}`, true),
      )
    })
    panel.querySelector('#zion-inv-shot').addEventListener('click', () => {
      fetch('http://127.0.0.1:5198/api/inspector/shot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'panel-full' }),
      }).then((r) => r.json()).then((j) => setSt(j.ok ? `截图: ${j.path}` : `截图失败: ${j.error}`),
        (err) => setSt(`截图服务未启动(用 cli shot): ${err.message}`, true))
    })
  }
  buildPanel()
})()
