// ============================================================
// inspector/recipes.js — 官方组件召唤配方(注入官方 3080 页面运行)。
// 在 page-panel.js 之后注入;只向 window.__ZION_RECIPES__ 注册描述,
// 执行由 page-panel 的核心引擎负责。
//
// 配方形态:
//   { id, name, kind: 'overlay' | 'real',
//     module?, component?, props?|propsFn?   // overlay
//     run?(core) → { selector, rect, note }  // real
//   }
// ============================================================
window.__ZION_RECIPES__ = (() => {
  const zhGoal = {
    'phase.active': '进行中的目标',
    'phase.paused': '已暂停的目标',
    'phase.blocked': '受阻的目标',
    'objective.aria': '目标内容',
    'commandInput.aria': '命令输入',
    'action.save': '保存目标',
    'action.cancel': '取消编辑',
    'action.pause': '暂停目标',
    'action.resume': '恢复目标',
    'action.edit': '编辑目标',
    'action.clear': '清除目标',
  }
  const zhJob = {
    'count.live.one': '{count} 个后台任务运行中',
    'count.live.other': '{count} 个后台任务运行中',
    'count.idle.one': '{count} 个后台任务',
    'count.idle.other': '{count} 个后台任务',
    'list.aria': '后台任务',
    'status.running': '运行中',
    'status.stopping': '正在停止',
    'status.completed': '已完成',
    'status.killed': '已取消',
    'status.failed': '已失败',
    'duration.seconds': '{seconds}秒',
    'duration.minutes': '{minutes}分{seconds}秒',
    'duration.hours': '{hours}小时{minutes}分',
    'duration.title.live': '已运行 {duration}',
    'duration.title.done': '耗时 {duration}',
  }

  const ok = () => Promise.resolve({ ok: true })
  const goalT = (() => { // 在 recipes 加载时无法拿 core.makeT(它在 page-panel 里),延迟到执行时构造
    let t = null
    return () => {
      if (!t) t = window.__zionInspector._core.makeT(zhGoal)
      return t
    }
  })()
  const jobT = (() => {
    let t = null
    return () => {
      if (!t) t = window.__zionInspector._core.makeT(zhJob)
      return t
    }
  })()

  const goalSnapshot = (phase, objective) => ({
    id: 'mock-goal-inspector',
    revision: 1,
    objective,
    phase,
    ...(phase === 'blocked' ? { blockedReason: { code: 'mock-block', message: '模型输出被安全策略拦截(演示数据)' } } : {}),
  })

  /** 真实配方:往 composer 键入 /goal <objective> 回车 → 官方真实 GoalBar(会话内投影)。 */
  const realGoalBar = async (core) => {
    const ta = core.pickComposerTextarea()
    if (!ta) throw new Error('未找到 composer 输入框 —— 先新建/选中一个会话再试')
    const objective = '组件召唤器演示目标 — inspector real goal'
    core.setNativeValue(ta, `/goal ${objective}`)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    const el = await core.waitFor('[data-goal-bar]', 15000)
    if (!el) throw new Error('15s 内未出现 [data-goal-bar];检查 /goal 命令是否可用(真实后端需已配置模型)')
    core.flash('[data-goal-bar]')
  
  /** 真实配方:队列激活(仅真后端;fixture 不发射 session/queue 帧,无法排队)。 */
  const realQueueDock = async (core) => {
    // 1) 确保有会话可发:优先新建干净会话(避免污染既有会话)
    const ta0 = core.pickComposerTextarea()
    if (!ta0) {
      const newBtn = [...document.querySelectorAll('button')].find((b) =>
        b.getAttribute('aria-label') === '新建会话' && b.getBoundingClientRect().width > 0)
      if (newBtn) { newBtn.click(); await core.sleep(1500) }
    }
    const ta = core.pickComposerTextarea()
    if (!ta) throw new Error('没有可用 composer(先新建/选中一个会话)')
    // 2) 第一条:长任务 → 真后端 LLM 流式生成,运行窗口几十秒
    const longTask = '请写一份关于 agent 工作流编排的详细研究报告:分五个章节,每章不少于五百字,引用具体机制(队列、审批、工具调用、投影),内容完整详尽,不要提前结束。'
    core.setNativeValue(ta, longTask)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    // 3) 等运行起来(发送态变化/停止按钮出现),再发第二条 → 排队
    await core.sleep(2500)
    const stopBtn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return /^停止$/.test(t) || aria === '停止' && b.getBoundingClientRect().width > 0
    })
    const ta2 = core.pickComposerTextarea()
    if (!ta2) throw new Error('composer 不可用(第一条可能触发了接管)')
    core.setNativeValue(ta2, '第二条:排队消息 —— 等第一条完成后由你处理,简要回答即可。')
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    const el = await core.waitFor('[data-queue-dock]', 15000)
    if (!el) {
      throw new Error(
        '15s 内未出现 [data-queue-dock]。' +
        (stopBtn ? '' : '第一条发出后未检测到「停止」(回合没在跑:模型未配置/回合秒完?)') +
        '排队前提:会话运行中再发第二条(真后端;fixture 不支持队列)。',
      )
    }
    core.flash('[data-queue-dock]')
    return {
      selector: '[data-queue-dock]',
      rect: core.rectOf(el),
      note: '真实排队激活:第二条在运行中发出 → 官方 QueueDock 队列行(编辑/插队/移除;真后端会话),验证后建议 recipe queue-dock-clean 清理',
    }
  }

  /** 真实配方:清理队列探针(停止运行 + 移除排队行;会话本身保留,可自行归档)。 */
  const realQueueDockClean = async (core) => {
    const stop = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return (/^停止$/.test(t) || aria === '停止') && b.getBoundingClientRect().width > 0
    })
    if (stop) { stop.click(); await core.sleep(1200) }
    const removeBtns = [...document.querySelectorAll('[data-queue-dock] button')].filter((b) => {
      const aria = b.getAttribute('aria-label') || ''
      const t = (b.textContent || '').trim()
      return /移除|删除|remove/i.test(aria) || /^移除$/.test(t)
    })
    for (const b of removeBtns) { b.click(); await core.sleep(400) }
    return {
      ok: true,
      selector: '[data-queue-dock]',
      rect: core.rectOf(document.querySelector('[data-queue-dock]')),
      note: `已清理:${stop ? '停止运行;' : ''}移除 ${removeBtns.length} 个排队行;会话保留(可自行归档)`,
    }
  }

  return { selector: '[data-goal-bar]', rect: core.rectOf(el), note: `已通过 /goal 创建真实目标(目标条在 composer 上方;目标:${objective})` }
  }

  /** 在侧边栏选中一个会话:优先匹配文本(刚刚/1分钟/2分钟 = fixture 相对时间行),退化为「Fixture 历史会话」组第一行。 */
  const selectSidebarSession = async (core) => {
    const tryClick = (el) => { if (!el) return false; el.click(); return true }
    const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0)
    const rowText = leaves.find((e) => /^(刚刚|[0-9]+分钟|alpha|fx-)/i.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0)
    if (rowText) {
      const clickable = rowText.closest('button, [role="button"], [class*="row"]') || rowText
      if (tryClick(clickable)) { await core.sleep(700); return true }
    }
    // 退化为组内第一行:「Fixture 历史会话」标题之后的第一个可点行
    const group = leaves.find((e) => /Fixture 历史会话|历史会话/.test(e.textContent || ''))
    if (group) {
      const container = group.closest('div') || group.parentElement
      if (container) {
        const row = container.querySelector('button, [role="button"], [class*="row"]')
        if (tryClick(row)) { await core.sleep(700); return true }
      }
    }
    return false
  }

  /** 关掉 composer 接管:常驻审批(点「拒绝」)+ 问题组(放弃整组问题)。 */
  const dismissComposerTakeover = async (core) => {
    for (const aria of ['放弃整组问题']) {
      const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === aria)
      if (b) { b.click(); await core.sleep(500) }
    }
    const reject = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      return /^拒绝$/.test(t) && b.getBoundingClientRect().width > 0
    })
    if (reject) { reject.click(); await core.sleep(700) }
  }

  /** 真实配方:conversation.input.dock 槽整区(真实条目 = TodoPanel + GoalBar + QueueDock)。 */
  const realInputDock = async (core) => {
    await selectSidebarSession(core, /alpha/i)
    await dismissComposerTakeover(core)
    // 确保 goal 条目存在(槽内三条之一)
    if (!document.querySelector('[data-goal-bar]')) {
      const ta = core.pickComposerTextarea()
      if (ta) {
        core.setNativeValue(ta, '/goal 槽位演示目标 — conversation.input.dock 条目')
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
        await core.waitFor('[data-goal-bar]', 15000)
      }
    }
    const entrySel = '[data-testid="todo-panel"], [data-goal-bar], [data-queue-dock]'
    const first = await core.waitFor(entrySel, 8000)
    if (!first) throw new Error('input.dock 槽条目未出现(需 fx-alpha 会话 + 目标;QueueDock 仅在有排队行时渲染)')
    for (const el of document.querySelectorAll(entrySel)) {
      if (el.getBoundingClientRect().width > 0) el.style.outline = '2px dashed #ff3b6b'
      setTimeout(() => { el.style.outline = '' }, 2500)
    }
    const rect = core.unionRect(entrySel)
  
  /** 真实配方:队列激活(仅真后端;fixture 不发射 session/queue 帧,无法排队)。 */
  const realQueueDock = async (core) => {
    // 1) 确保有会话可发:优先新建干净会话(避免污染既有会话)
    const ta0 = core.pickComposerTextarea()
    if (!ta0) {
      const newBtn = [...document.querySelectorAll('button')].find((b) =>
        b.getAttribute('aria-label') === '新建会话' && b.getBoundingClientRect().width > 0)
      if (newBtn) { newBtn.click(); await core.sleep(1500) }
    }
    const ta = core.pickComposerTextarea()
    if (!ta) throw new Error('没有可用 composer(先新建/选中一个会话)')
    // 2) 第一条:长任务 → 真后端 LLM 流式生成,运行窗口几十秒
    const longTask = '请写一份关于 agent 工作流编排的详细研究报告:分五个章节,每章不少于五百字,引用具体机制(队列、审批、工具调用、投影),内容完整详尽,不要提前结束。'
    core.setNativeValue(ta, longTask)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    // 3) 等运行起来(发送态变化/停止按钮出现),再发第二条 → 排队
    await core.sleep(2500)
    const stopBtn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return /^停止$/.test(t) || aria === '停止' && b.getBoundingClientRect().width > 0
    })
    const ta2 = core.pickComposerTextarea()
    if (!ta2) throw new Error('composer 不可用(第一条可能触发了接管)')
    core.setNativeValue(ta2, '第二条:排队消息 —— 等第一条完成后由你处理,简要回答即可。')
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    const el = await core.waitFor('[data-queue-dock]', 15000)
    if (!el) {
      throw new Error(
        '15s 内未出现 [data-queue-dock]。' +
        (stopBtn ? '' : '第一条发出后未检测到「停止」(回合没在跑:模型未配置/回合秒完?)') +
        '排队前提:会话运行中再发第二条(真后端;fixture 不支持队列)。',
      )
    }
    core.flash('[data-queue-dock]')
    return {
      selector: '[data-queue-dock]',
      rect: core.rectOf(el),
      note: '真实排队激活:第二条在运行中发出 → 官方 QueueDock 队列行(编辑/插队/移除;真后端会话),验证后建议 recipe queue-dock-clean 清理',
    }
  }

  /** 真实配方:清理队列探针(停止运行 + 移除排队行;会话本身保留,可自行归档)。 */
  const realQueueDockClean = async (core) => {
    const stop = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return (/^停止$/.test(t) || aria === '停止') && b.getBoundingClientRect().width > 0
    })
    if (stop) { stop.click(); await core.sleep(1200) }
    const removeBtns = [...document.querySelectorAll('[data-queue-dock] button')].filter((b) => {
      const aria = b.getAttribute('aria-label') || ''
      const t = (b.textContent || '').trim()
      return /移除|删除|remove/i.test(aria) || /^移除$/.test(t)
    })
    for (const b of removeBtns) { b.click(); await core.sleep(400) }
    return {
      ok: true,
      selector: '[data-queue-dock]',
      rect: core.rectOf(document.querySelector('[data-queue-dock]')),
      note: `已清理:${stop ? '停止运行;' : ''}移除 ${removeBtns.length} 个排队行;会话保留(可自行归档)`,
    }
  }

  return {
      selector: entrySel,
      rect,
      note: '官方 conversation.input.dock 槽:当前真实条目 = TodoPanel(任务条)+ GoalBar(目标条)+ QueueDock(队列行,有排队才渲染);社区插件在官方 3080 未注册此槽,故无第三方卡片',
    }
  }

  /** 真实配方:todo plan strip(?fixture 的 fx-alpha 会话自带 todo/write 投影)。 */
  const realTodoDock = async (core) => {
    await selectSidebarSession(core, /alpha/i)
    await dismissComposerTakeover(core)
    const el = await core.waitFor('[data-testid="todo-panel"]', 8000)
    if (!el) {
      throw new Error(
        'todo 条未出现。' +
        '官方真实后端需要一次含 todo/write 的 agent 回合(目标运行中才会写任务表);' +
        '用 --fixture 模式(页面带 ?fixture)并在侧边栏选中 fx-alpha 会话(自带 todo 投影)。',
      )
    }
    core.flash('[data-testid="todo-panel"]')
  
  /** 真实配方:队列激活(仅真后端;fixture 不发射 session/queue 帧,无法排队)。 */
  const realQueueDock = async (core) => {
    // 1) 确保有会话可发:优先新建干净会话(避免污染既有会话)
    const ta0 = core.pickComposerTextarea()
    if (!ta0) {
      const newBtn = [...document.querySelectorAll('button')].find((b) =>
        b.getAttribute('aria-label') === '新建会话' && b.getBoundingClientRect().width > 0)
      if (newBtn) { newBtn.click(); await core.sleep(1500) }
    }
    const ta = core.pickComposerTextarea()
    if (!ta) throw new Error('没有可用 composer(先新建/选中一个会话)')
    // 2) 第一条:长任务 → 真后端 LLM 流式生成,运行窗口几十秒
    const longTask = '请写一份关于 agent 工作流编排的详细研究报告:分五个章节,每章不少于五百字,引用具体机制(队列、审批、工具调用、投影),内容完整详尽,不要提前结束。'
    core.setNativeValue(ta, longTask)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    // 3) 等运行起来(发送态变化/停止按钮出现),再发第二条 → 排队
    await core.sleep(2500)
    const stopBtn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return /^停止$/.test(t) || aria === '停止' && b.getBoundingClientRect().width > 0
    })
    const ta2 = core.pickComposerTextarea()
    if (!ta2) throw new Error('composer 不可用(第一条可能触发了接管)')
    core.setNativeValue(ta2, '第二条:排队消息 —— 等第一条完成后由你处理,简要回答即可。')
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    const el = await core.waitFor('[data-queue-dock]', 15000)
    if (!el) {
      throw new Error(
        '15s 内未出现 [data-queue-dock]。' +
        (stopBtn ? '' : '第一条发出后未检测到「停止」(回合没在跑:模型未配置/回合秒完?)') +
        '排队前提:会话运行中再发第二条(真后端;fixture 不支持队列)。',
      )
    }
    core.flash('[data-queue-dock]')
    return {
      selector: '[data-queue-dock]',
      rect: core.rectOf(el),
      note: '真实排队激活:第二条在运行中发出 → 官方 QueueDock 队列行(编辑/插队/移除;真后端会话),验证后建议 recipe queue-dock-clean 清理',
    }
  }

  /** 真实配方:清理队列探针(停止运行 + 移除排队行;会话本身保留,可自行归档)。 */
  const realQueueDockClean = async (core) => {
    const stop = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return (/^停止$/.test(t) || aria === '停止') && b.getBoundingClientRect().width > 0
    })
    if (stop) { stop.click(); await core.sleep(1200) }
    const removeBtns = [...document.querySelectorAll('[data-queue-dock] button')].filter((b) => {
      const aria = b.getAttribute('aria-label') || ''
      const t = (b.textContent || '').trim()
      return /移除|删除|remove/i.test(aria) || /^移除$/.test(t)
    })
    for (const b of removeBtns) { b.click(); await core.sleep(400) }
    return {
      ok: true,
      selector: '[data-queue-dock]',
      rect: core.rectOf(document.querySelector('[data-queue-dock]')),
      note: `已清理:${stop ? '停止运行;' : ''}移除 ${removeBtns.length} 个排队行;会话保留(可自行归档)`,
    }
  }

  return { selector: '[data-testid="todo-panel"]', rect: core.rectOf(el), note: '官方 TodoPanel(plan strip,composer 上方;fx-alpha 会话)' }
  }

  /** 真实配方:todo plan strip 的展开态(幂等展开交给 core.ensureExpanded)。 */
  const realTodoDockExpanded = async (core) => {
    await selectSidebarSession(core, /alpha/i)
    await dismissComposerTakeover(core)
    const el = await core.waitFor('[data-testid="todo-panel"]', 8000)
    if (!el) throw new Error('todo 条未出现(需 --fixture 的 fx-alpha 会话)')
    await core.ensureExpanded('[data-testid="todo-panel"]')
    core.flash('[data-testid="todo-panel"]')
  
  /** 真实配方:队列激活(仅真后端;fixture 不发射 session/queue 帧,无法排队)。 */
  const realQueueDock = async (core) => {
    // 1) 确保有会话可发:优先新建干净会话(避免污染既有会话)
    const ta0 = core.pickComposerTextarea()
    if (!ta0) {
      const newBtn = [...document.querySelectorAll('button')].find((b) =>
        b.getAttribute('aria-label') === '新建会话' && b.getBoundingClientRect().width > 0)
      if (newBtn) { newBtn.click(); await core.sleep(1500) }
    }
    const ta = core.pickComposerTextarea()
    if (!ta) throw new Error('没有可用 composer(先新建/选中一个会话)')
    // 2) 第一条:长任务 → 真后端 LLM 流式生成,运行窗口几十秒
    const longTask = '请写一份关于 agent 工作流编排的详细研究报告:分五个章节,每章不少于五百字,引用具体机制(队列、审批、工具调用、投影),内容完整详尽,不要提前结束。'
    core.setNativeValue(ta, longTask)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    // 3) 等运行起来(发送态变化/停止按钮出现),再发第二条 → 排队
    await core.sleep(2500)
    const stopBtn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return /^停止$/.test(t) || aria === '停止' && b.getBoundingClientRect().width > 0
    })
    const ta2 = core.pickComposerTextarea()
    if (!ta2) throw new Error('composer 不可用(第一条可能触发了接管)')
    core.setNativeValue(ta2, '第二条:排队消息 —— 等第一条完成后由你处理,简要回答即可。')
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    const el = await core.waitFor('[data-queue-dock]', 15000)
    if (!el) {
      throw new Error(
        '15s 内未出现 [data-queue-dock]。' +
        (stopBtn ? '' : '第一条发出后未检测到「停止」(回合没在跑:模型未配置/回合秒完?)') +
        '排队前提:会话运行中再发第二条(真后端;fixture 不支持队列)。',
      )
    }
    core.flash('[data-queue-dock]')
    return {
      selector: '[data-queue-dock]',
      rect: core.rectOf(el),
      note: '真实排队激活:第二条在运行中发出 → 官方 QueueDock 队列行(编辑/插队/移除;真后端会话),验证后建议 recipe queue-dock-clean 清理',
    }
  }

  /** 真实配方:清理队列探针(停止运行 + 移除排队行;会话本身保留,可自行归档)。 */
  const realQueueDockClean = async (core) => {
    const stop = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return (/^停止$/.test(t) || aria === '停止') && b.getBoundingClientRect().width > 0
    })
    if (stop) { stop.click(); await core.sleep(1200) }
    const removeBtns = [...document.querySelectorAll('[data-queue-dock] button')].filter((b) => {
      const aria = b.getAttribute('aria-label') || ''
      const t = (b.textContent || '').trim()
      return /移除|删除|remove/i.test(aria) || /^移除$/.test(t)
    })
    for (const b of removeBtns) { b.click(); await core.sleep(400) }
    return {
      ok: true,
      selector: '[data-queue-dock]',
      rect: core.rectOf(document.querySelector('[data-queue-dock]')),
      note: `已清理:${stop ? '停止运行;' : ''}移除 ${removeBtns.length} 个排队行;会话保留(可自行归档)`,
    }
  }

  return { selector: '[data-testid="todo-panel"]', rect: core.rectOf(el), note: '官方 TodoPanel 展开态(任务列表向上展开,fx-alpha 会话)' }
  }


  /** 真实配方:队列激活(仅真后端;fixture 不发射 session/queue 帧,无法排队)。 */
  const realQueueDock = async (core) => {
    // 1) 确保有会话可发:优先新建干净会话(避免污染既有会话)
    const ta0 = core.pickComposerTextarea()
    if (!ta0) {
      const newBtn = [...document.querySelectorAll('button')].find((b) =>
        b.getAttribute('aria-label') === '新建会话' && b.getBoundingClientRect().width > 0)
      if (newBtn) { newBtn.click(); await core.sleep(1500) }
    }
    const ta = core.pickComposerTextarea()
    if (!ta) throw new Error('没有可用 composer(先新建/选中一个会话)')
    // 2) 第一条:长任务 → 真后端 LLM 流式生成,运行窗口几十秒
    const longTask = '请写一份关于 agent 工作流编排的详细研究报告:分五个章节,每章不少于五百字,引用具体机制(队列、审批、工具调用、投影),内容完整详尽,不要提前结束。'
    core.setNativeValue(ta, longTask)
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    // 3) 等运行起来(发送态变化/停止按钮出现),再发第二条 → 排队
    await core.sleep(2500)
    const stopBtn = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return /^停止$/.test(t) || aria === '停止' && b.getBoundingClientRect().width > 0
    })
    const ta2 = core.pickComposerTextarea()
    if (!ta2) throw new Error('composer 不可用(第一条可能触发了接管)')
    core.setNativeValue(ta2, '第二条:排队消息 —— 等第一条完成后由你处理,简要回答即可。')
    ta2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    const el = await core.waitFor('[data-queue-dock]', 15000)
    if (!el) {
      throw new Error(
        '15s 内未出现 [data-queue-dock]。' +
        (stopBtn ? '' : '第一条发出后未检测到「停止」(回合没在跑:模型未配置/回合秒完?)') +
        '排队前提:会话运行中再发第二条(真后端;fixture 不支持队列)。',
      )
    }
    core.flash('[data-queue-dock]')
    return {
      selector: '[data-queue-dock]',
      rect: core.rectOf(el),
      note: '真实排队激活:第二条在运行中发出 → 官方 QueueDock 队列行(编辑/插队/移除;真后端会话),验证后建议 recipe queue-dock-clean 清理',
    }
  }

  /** 真实配方:清理队列探针(停止运行 + 移除排队行;会话本身保留,可自行归档)。 */
  const realQueueDockClean = async (core) => {
    const stop = [...document.querySelectorAll('button')].find((b) => {
      const t = (b.textContent || '').trim()
      const aria = b.getAttribute('aria-label') || ''
      return (/^停止$/.test(t) || aria === '停止') && b.getBoundingClientRect().width > 0
    })
    if (stop) { stop.click(); await core.sleep(1200) }
    const removeBtns = [...document.querySelectorAll('[data-queue-dock] button')].filter((b) => {
      const aria = b.getAttribute('aria-label') || ''
      const t = (b.textContent || '').trim()
      return /移除|删除|remove/i.test(aria) || /^移除$/.test(t)
    })
    for (const b of removeBtns) { b.click(); await core.sleep(400) }
    return {
      ok: true,
      selector: '[data-queue-dock]',
      rect: core.rectOf(document.querySelector('[data-queue-dock]')),
      note: `已清理:${stop ? '停止运行;' : ''}移除 ${removeBtns.length} 个排队行;会话保留(可自行归档)`,
    }
  }

  return {
    'goal-bar': {
      id: 'goal-bar',
      name: 'GoalBar(舞台·进行中)',
      kind: 'overlay',
      module: '@deepseek-ai/dsh-client-ui-goal',
      component: 'GoalBar',
      props: () => ({
        goal: goalSnapshot('active', '构建官方 UI 组件召唤器,让 AI 能直接呼出任意官方组件查看真实运行状态'),
        onEdit: ok, onPause: ok, onResume: ok, onClear: ok,
        t: goalT(),
      }),
    },
    'goal-bar-paused': {
      id: 'goal-bar-paused',
      name: 'GoalBar(舞台·已暂停)',
      kind: 'overlay',
      module: '@deepseek-ai/dsh-client-ui-goal',
      component: 'GoalBar',
      props: () => ({
        goal: goalSnapshot('paused', '暂停中的目标:等待恢复后继续推进(演示数据)'),
        onEdit: ok, onPause: ok, onResume: ok, onClear: ok,
        t: goalT(),
      }),
    },
    'goal-bar-blocked': {
      id: 'goal-bar-blocked',
      name: 'GoalBar(舞台·受阻)',
      kind: 'overlay',
      module: '@deepseek-ai/dsh-client-ui-goal',
      component: 'GoalBar',
      props: () => ({
        goal: goalSnapshot('blocked', '受阻的目标:需要人工介入解除阻塞(演示数据)'),
        onEdit: ok, onPause: ok, onResume: ok, onClear: ok,
        t: goalT(),
      }),
    },
    'goal-bar-real': {
      id: 'goal-bar-real',
      name: 'GoalBar(真实·/goal 命令)',
      kind: 'real',
      run: realGoalBar,
    },
    'todo-dock': {
      id: 'todo-dock',
      name: 'TodoDock plan strip(真实)',
      kind: 'real',
      run: realTodoDock,
    },
    'todo-dock-expanded': {
      id: 'todo-dock-expanded',
      name: 'TodoDock 展开态(真实·任务列表)',
      kind: 'real',
      run: realTodoDockExpanded,
    },
    'input-dock': {
      id: 'input-dock',
      name: 'conversation.input.dock 槽(真实·全部条目)',
      kind: 'real',
      run: realInputDock,
    },
    'goal-dock': {
      id: 'goal-dock',
      name: 'GoalDock(槽条目适配器·舞台)',
      kind: 'overlay',
      module: '@deepseek-ai/dsh-client-ui-goal',
      component: 'GoalDock',
      props: () => ({
        useProjection: (key) => key === 'goal'
          ? { goal: goalSnapshot('active', 'GoalDock 是 conversation.input.dock 槽的 goal 条目:useProjection 适配器 + 注入动作') }
          : undefined,
        onEdit: ok, onPause: ok, onResume: ok, onClear: ok,
        t: goalT(),
      }),
    },
    'queue-dock': {
      id: 'queue-dock',
      name: 'QueueDock(真实·排队激活,仅真后端)',
      kind: 'real',
      run: realQueueDock,
    },
    'queue-dock-clean': {
      id: 'queue-dock-clean',
      name: 'QueueDock 清理(停止+移除排队行)',
      kind: 'real',
      run: realQueueDockClean,
    },

  }
})()
