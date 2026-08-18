/**
 * Plugin runtime 底座 — 演示插件 client 半 (Q17A 验证用)。
 *
 * 一个普通插件源码字符串:注册两个附加型槽
 *   - sidebar.footer.action (list): 侧栏底部一个版本徽标
 *   - conversation.input.dock (list): 输入区上方一个状态卡
 * 并试验禁区(注册 root 主机位被拒、fetch 被 trap 拒)以验证 guard。
 * 不作为量产产物,仅证明"源码即闭包 + guard + 附加型槽"全链路跑通。
 */
export const demoPluginSource = `return {
  name: 'zion-demo-additive',
  inject: ['slots'],
  apply(ctx) {
    // 1) 附加型 list 槽: 侧栏底部动作
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
      { name: 'sidebar.footer.action', id: 'zion-version', order: 5, label: '插件底座' },
      () => React.createElement('span', { className: 'plugin-demo-badge' },
        '底座 · ' + (typeof host !== 'undefined' && host ? 'host面不可用' : 'live'),
      ),
    ))
    // 2) 附加型 list 槽: 输入区 dock
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
      { name: 'conversation.input.dock', id: 'zion-status', order: 10, label: '输入dock' },
      () => React.createElement('div', { className: 'plugin-demo-dock' },
        React.createElement('span', null, '🧩 插件运行时'),
        React.createElement('span', { className: 'plugin-demo-dock-sub' }, 'client 半 · 闭包求值 · guard · 附加型槽'),
      ),
    ))
    // 3) 附加型 list 槽: assistant 消息 action 行
    ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
      { name: 'conversation.chat.assistant-actions', id: 'zion-copy', order: 5, label: '复制' },
      () => React.createElement('button', { className: 'plugin-demo-action', type: 'button' }, '复制回答'),
    ))
    // 4) 附加型 keyed 槽: settings.plugin.item(右栏)
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
      { name: 'settings.plugin.item', key: 'zion-settings-card', label: '插件设置卡' },
      () => React.createElement('div', { className: 'plugin-demo-settings' }, '🧩 插件设置卡(settings.plugin.item)'),
    ))
    // 5) 附加型 keyed 槽: tool.call.toolview(自定义工具名,不抢占已发货 key)
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key: 'zion_tool_demo', label: '自定义工具视图' },
      () => React.createElement('div', { className: 'plugin-demo-toolview' }, '🛠 zion_tool_demo 专属工具卡'),
    ))
    // 5b) host.call 演示: 点击按钮走 remote invoke 通道(真后端下路由到宿主半)
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
      { name: 'conversation.input.dock', id: 'zion-hostcall', order: 30, label: 'host.call' },
      () => React.createElement('button', {
        className: 'plugin-demo-hostcall', type: 'button',
        onClick: () => {
          host.call('zion.demo.ping', { hello: 'world' }).then(
            (value) => console.log('[zion-demo] host.call ok:', JSON.stringify(value)),
            (error) => console.log('[zion-demo] host.call failed (expected without host half):', String(error)),
          )
        },
      }, 'host.call 测试'),
    ))
    // 6) 禁区验证: 注册主机位 → 抛 guard 错误 (下面 try/catch 演示拒绝同时不崩)
    try {
      ctx.slots.register({ name: 'root' }, () => React.createElement('div', null, 'host seat'))
    } catch (error) {
      console.warn('[zion-demo] host-seat register rejected (expected):', String(error))
    }
  },
}
`

/** The runtime demo also proves the timer/fetch traps end-to-end. */
export const demoTrapProbeSource = `return {
  name: 'zion-demo-traps',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
      { name: 'conversation.input.dock', id: 'zion-traps', order: 20, label: '禁区探针' },
      () => React.createElement('div', { className: 'plugin-demo-dock plugin-demo-dock--traps' },
        React.createElement('span', null, '⛔ 禁区探针'),
        React.createElement('span', { className: 'plugin-demo-dock-sub' }, 'fetch/setTimeout 已被 trap 拦截(无 host 面)'),
      ),
    ))
  },
}
`
