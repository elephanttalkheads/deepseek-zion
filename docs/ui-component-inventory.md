# zion 渲染面 UI 组件 · 交互入口 · 数据依赖 全量清单

> 用途:**给 kimi code(或任何重构 UI 的 agent)在重写/重构 zion 渲染面时,防丢失功能入口与 UI 组件**。
> 编写:2026-08-20 · deepseek-v4-flash on DSH(基于只读探索的 `docs/_tmp-ui-inventory-context.md` 整合;探索未改任何文件)。
> 路径约定:本节与全文均为相对 `D:\deepseek-zion` 的相对路径(反斜杠)。
> 这份清单是「zion 渲染面 ↔ 入口 ↔ 功能」的执行视图;官方侧入口盘点在 `docs/ui-entry-gap-inventory.md`。

---

## 0. 搬运声明(重构前必读)

### 0.1 三条硬约束

1. **官方入口不可丢**:README 语境下,zion 是复刻 dsh web(3080)的 UI。本文档里标为 **`official`** 的入口,对应官方 3080 UI 实际存在的可点入口——**任何重构后必须仍存在且可操作**(位置、样式、措辞可改,功能与信息不可删)。标为 **`zion-add`** 的是 zion 自研附加入口(hero 文案、插件演示按钮等),可自由重设计。标为 **`slot`** 的是插件槽锚点(动态插件注入面),删除即丢失第三方/演示插件入口,除非明确移除对应插件能力。
2. **AGENTS.md UI 铁律**:本项目 `AGENTS.md` 的「改 UI 风格时,不删复刻的 dsh web UI 展示内容」铁律当前**处于暂停期**(复刻补全阶段),但本清单交付后若进入**风格化改造**阶段,该铁律自动恢复生效——即:优先改样式(颜色/字体/间距/动效/位置/圆角/文案),不删内容;确需删除某既有展示元素/入口时,先在 `ui-change-log/` 下按日期建记录写明「删什么、为何删、替代方案、如何验证」,提交记录后才允许删。本清单中所有 **`official`** 标记项即铁律所保护的「复刻展示内容」。
3. **UI 动作出口单一**:zion 所有 UI 动作(增删改查、导航、命令、审批)最终都经 `useRuntime()`(见 `renderer/src/app/runtime.tsx`,§B15)。改 UI 时**保留这些 action 调用**即不丢功能;不要在内层组件里重新发明 RPC 调用。

### 0.2 深读指引(与本清单配套的既有文档)

| 文档 | 用途 |
|---|---|
| `docs/ui-entry-gap-inventory.md` | 官方 3080 **可点入口**的差距执行索引(已全部回勾);核对「某官方入口在 zion 里对应哪个组件」看它 |
| `docs/rpc-wiring-inventory--zion-per-path.md` | 每个 **RPC/写路径** zion 是否已桥;排查某功能「调得通吗」 |
| `docs/ui-inventory-audit--zion-data-feasibility.md` | **内容能画吗**(数据面可行性,含 projection 键清单) |
| `docs/real-backend-only-verification.md` | 真后端专属项核验 + 400 归因(opencode-go 工具 schema 数超限,与 UI 无关) |

---

## 1. 总览

### 1.1 渲染树(挂载关系)

```
main.tsx Root
└─ PluginProvider (renderer\src\plugin\hub.tsx)
   └─ RuntimeProvider (renderer\src\app\runtime.tsx)
      └─ AppFrame (renderer\src\ui\AppFrame.tsx)
         ├─ SlotAnchor slot="shell.overlay"                     (顶层 overlay,list 槽)
         ├─ header 顶栏: 「新会话」按钮 + WorkspaceMenu(含 Miller 目录弹窗)
         ├─ aside.app-sidebar → Sidebar
         │    ├─ SlotAnchor slot="sidebar.footer.action"
         │    └─ SettingsShell(⚙ 触发;通用/模型/Agent 预设/插件 四分区;插件页=配置三卡+列表三组)
         ├─ main.app-conversation → ConversationDock
         │    ├─ hero(无会话): AgentPresetSeat
         │    ├─ 会话态: 会话头(agent-preset Label + SubagentCatalogAction + JobListAction)
         │    ├─ 视图: TrajectoryPane(轨迹) | ChatView(chat)
         │    ├─ QueueDock(队列) + streaming 提示
         │    └─ ComposerSeat → 选举 approval > question > 只读子代理 > InputBar
         ├─ aside.app-details → DetailsPanel(右栏;SubagentPanel + SlotAnchor settings.plugin.item)
         └─ PluginHost(底部插件控制台)
```

### 1.2 交互入口密度(重构时逐入口回归的重点)

| 组件 | 文件 | 直接交互入口数 | 官方/Zion |
|---|---|---|---|
| InputBar | `renderer\src\ui\InputBar.tsx` | 12+ 类 + 5 子座位 | 混合(最高密度) |
| Sidebar | `renderer\src\ui\Sidebar.tsx` | 20 | 混合 |
| SettingsShell | `renderer\src\ui\SettingsShell.tsx` | 19+ | 混合 |
| GoalBar | `renderer\src\ui\GoalBar.tsx` | 13 | zion-add/goal |
| PluginHost | `renderer\src\ui\PluginHost.tsx` | 13 | zion-add(cordis 演示) |
| ChatView | `renderer\src\ui\ChatView.tsx` | 3 类 + 子座位 | official |
| WorkspaceMenu | `renderer\src\ui\WorkspaceMenu.tsx` | 6+ | official |
| QueueDock | `renderer\src\ui\QueueDock.tsx` | 6 | official |
| SubagentPanel | `renderer\src\ui\SubagentPanel.tsx` | 4 | zion-add(subagent RPC) |
| ConversationDock | `renderer\src\ui\ConversationDock.tsx` | 2(Chat/轨迹 tab) | official |
| DetailsPanel | `renderer\src\ui\DetailsPanel.tsx` | 0(占位+槽) | official |
| ToolCallCard | `renderer\src\ui\ToolCallCard.tsx` | 1(折叠) | official |

> 各 `src\app\` 座位(seat)把 vendor 官方组件的注入面接上 zion,入口数不计(由 vendor 组件内部承载);重构若替换 vendor 组件必须按 §2 重建同样注入面。

---

## 2. 逐组件清单

> 记号:`official` = 对应官方 3080 可点入口(重构后必须保留);`zion-add` = zion 附加入口(可重设计);`slot` = 动态插件槽锚点(不可删除非移除插件能力)。

### Part A — `renderer\src\ui\`(自研组件)

#### A1. AppFrame — UI 根壳 ✅ 已迁移(ZION 块 1+2+16,2026-08-23;demo: `ui-prototype/ambient/`)
- **挂载**:`main.tsx` 的 Root(`PluginProvider > RuntimeProvider > AppFrame`)。
- **交互入口**:① `button.shell-new`「新会话」→ `createSession()`(wire.sessions.create + 选中)[official];② `WorkspaceMenu`(顶栏工作区下拉,A13)[official];③ 无其他直接可点元素(`shell-brand`/`shell-badge` 纯展示)。
- **数据**:`useRuntime()` — `connectionState`/`isFixture`/`workspaces[0]`(current)/`createSession`;本地 `query`、`workspaceMenuOpen`。
- **挂载子组件**:`RainCanvas` + `.scanlines`(ZION 氛围层,零交互,pointer-events:none;fx 两档由选中会话 running 经 `app/ambient-fx.ts` 模块级对象驱动)/ Sidebar / ConversationDock / DetailsPanel / PluginHost / WorkspaceMenu / `SlotAnchor slot="shell.overlay"` [slot]。

#### A2. Sidebar — 会话列表(入口最密集之二)
- **挂载**:AppFrame `aside.app-sidebar`;props `{ query, onQueryChange }`。
- **交互入口**:
  1. `input.sidebar-search-input` 搜索 → 本地过滤(标题/sessionId)[official]
  2. `button.sidebar-view-options` 视图选项 → Menu: 按工作区/单列表/手动排序/最近更新(本地 view state)[official]
  3. `button.sidebar-new`「+」→ `createSession()`[official]
  4. `button.sidebar-caret`(有子会话时)→ 展开/收起子会话行 [official]
  5. `button.sidebar-row` 整行 → `selectSession(id)`[official]
  6. `button.sidebar-row-menu`(⋯)→ 行菜单: **重命名**(→ Modal)/ **分叉会话**(→ `sessionRowActions.fork(id)`,成功选子代)/ **归档会话**(→ `sessionRowActions.archive(id)`)[official]
  7. RenameSessionModal(vendor `Modal`): 输入 + 取消 + 保存(`sessionRowActions.rename`;Enter/Escape)[official]
  8. 会话行拖拽(仅「按工作区」分组非未分组行)→ drop 上/下半 → `workspaceActions.insertSessionBefore`[official]
  9. 工作区组头拖拽 → `workspaceActions.insertBefore`[official]
  10. `button.sidebar-group-more`「+N 个更多…」→ 展开折叠组(COLLAPSED=5)[official]
  11. `button.sidebar-settings-trigger`「⚙」→ 打开 `SettingsShell`[official]
  12. `SlotAnchor slot="sidebar.footer.action"` (插件可注入)[slot]
- **数据**:`useSessions`(items/state)、`selectSession`、`selectedSessionId`、`createSession`、`workspaces`(分组账目 ws.sessionIds)、`sessionRowActions`、`workspaceActions`。
- **vendor import**:`ui-primitives\Menu.tsx`/`Modal.tsx`/icons、`client-runtime\client\sessions\lineage.ts`(类型)。
- **内部组件**:`RenameSessionModal`、工具函数 relativeTime/basename。

#### A3. ConversationDock — 会话主区
- **挂载**:AppFrame `main.app-conversation`。
- **交互入口**:① `button.conversation-header-tab`「Chat」→ `setView('chat')`[official];② 同上「轨迹」→ `setView('trajectory')`(渲染 TrajectoryPane)[official];③ `nav.conversation-header-crumbs`「会话层级」面包屑(`aria-label="会话层级"`;沿 parentSessionId 上溯祖先链,点祖先段 → `selectSession(父)`,即官方「返回主会话」入口——进入子代理会话后可点父段回到主会话)[official];其余下沉子组件。
- **数据**:`useSessions`(选中会话 title)、`useConversation`(chat.order/nodes/timeline/running/composerPhase)、`wire`、`selectedSessionId`;本地 `view`(会话切换重置为 chat)。
- **挂载子组件**:hero→`AgentPresetSeat`;会话→`AgentPresetLabelSeat` + `SubagentCatalogActionSeat` + `JobListActionSeat`(会话头动作行)、`TrajectoryPane`/`ChatView`、`QueueDock`、streaming 提示、`ComposerSeat`。

#### A4. ChatView — 消息流 ✅ 已迁移(ZION 块 6+7+11+12,2026-08-27;demo: `ui-prototype/conversation/`)
- **挂载**:ConversationDock(view=chat 且 nodes 非空);props `{ nodes, wire, timeline, sessionId }`。
- **交互入口**:
  1. 消息 `MessageIconActions`(vendor): 复制(正文 text)、分支(assistant,`forkNode`→`forkSession(node.anchorSeq)`)、hover 时间戳钟[official]
  2. assistant 消息 `SlotAnchor slot="conversation.chat.assistant-actions"` (插件可注入按钮)[slot]
  3. 图片 `ImageGallery`(vendor ui-attachment): 点击 → `ImageLightbox` 原图(`wire.sessions.get(id).readAttachment(attachmentId)`)[official]
  4. tool-call 节点: `ToolCallCard`(折叠)+ `toolName==='skill'` → `SkillRowSeat`;每工具 `SlotAnchor slot="tool.call.toolview"` (keyed,ownerProps={tool,key})[slot]
  5. turn-tail: `ProducedFilesSeat`(产物 chip → `wire.api.host.openPath`)[official]
  6. workflow-run 节点: `WorkflowRunSeat`(openSession → `selectSession(id)`)[official]
- **数据**:`forkSession`;props `nodes/wire/timeline`;vendor `ui-attachment/index`、`client-ui-conversation\client\*.tsx`(MessageIconActions/image-labels/locales)。
- **译文**:`makeT(conversationZh)`(`locale-common.ts`)。

#### A5. DetailsPanel — 右栏
- **挂载**:AppFrame `aside.app-details`。
- **交互入口**:无直接可点;选中会话渲染 `SubagentPanel`(zion-add,官方右栏无子代理面板——官方把子代理放会话头目录树 + 只读 composer + 会话层级面包屑);`SlotAnchor slot="settings.plugin.item"` (keyed,ownerProps={sessionId})[slot]。
- **数据**:`selectedSessionId`(未选中显示 "No selection")。

#### A6. GoalBar — 目标条
- **挂载**:InputBar(composer 顶部 goal strip)。
- **交互入口**:空态「设定目标」;创建表单(objective/上限轮次/设定/取消 → `goalActions.create`);有目标态 edit/pause(active)/resume(paused|blocked)/complete(非 complete)/clear;编辑表单(保存 → `goalActions.edit`)[zion-add/goal 官方 /goal 命令的 GUI 面]。
- **数据**:`useGoal`(GoalProjectionValue:{id,revision,objective,phase,maxGoalRounds})、`goalActions`、`selectedSessionId`。

#### A7. InputBar — 输入栏(入口最密集) ✅ 已迁移(ZION 块 13,2026-08-21;demo: `ui-prototype/input-bar/`)
- **挂载**:`ComposerSeat`(composer-takeover.tsx 无挂起交互时的回退体)。
- **交互入口**:
  1. 触发管线 `trigger.render()`(→ MenuView + PopupSelectView):输入 `/` 弹命令/技能菜单;`/permission` → popupSelect(Full access 风险确认 → `session.command('/permission <id>')`);↑/↓/Enter/Escape 仲裁 [official]
  2. `SlotAnchor slot="conversation.input.dock"` (插件可注入状态卡/host.call 测试)[slot] —— 什么是插件槽/槽里有什么/两条实现路径,详见 §1.3 插件槽详解(防误解必读)
  3. `TodoDockSeat`(composer 上方 plan strip)[official]
  4. `GoalBar`(A6)[zion-add]
  5. `PermissionChip`(B8)→ 预设菜单 → `/permission <id>` [official]
  6. `PlanSeat`(B9)→ `session.command('/plan off')`[official]
  7. `ModelSelectAdapter`(B6,模型/推理等级两列菜单 → sessions.selectModel)[official]
  8. `button.input-bar-add`「+」→ 命令列表;`command-panel-item` → `pickCommand`(`/name ` 入草稿)[official]
  9. textarea:Enter 发送 / Shift+Enter 换行;触发管线 track/arbitrate;粘贴图片 [official]
  10. `button.input-bar-attach`「📎」→ 隐藏 file input → `readFiles`(FileReader→base64 PendingImage)[official]
  11. 整页拖放摄入:document 级 dragenter/over/leave/drop + `DropOverlay` 覆盖层 [official]
  12. `AttachmentRail`(vendor):点击缩略图 → `ImageLightbox`;移除按钮 → 删本地图 [official]
  13. `button.input-bar-stop`「停止」(running)→ `stop()`(session.cancel)[official]
  14. `button.input-bar-send`「发送」→ submit():以 `/` 开头 → `runCommand(text)`(session.command);否则 `sendPrompt(parts)`(session.prompt(parts,'queue');运行中亦可排队)[official]
  15. `ContextMeterSeat`(composer 尾部上下文环)[official]
- **数据**:`wire`、`selectedSessionId`、`sendPrompt`、`stop`、`useConversation`(running/promptError)、`imageLimits`、`runCommand`、`listCommands`(wire rpc commands/list)、`useTriggerPipeline`(trigger-menu.tsx,消费 `usePermissions`)。
- **vendor import**:`client-ui-conversation`(locales/image-labels)、`ui-attachment`(AttachmentRail/DropOverlay/ImageLightbox)、`ui-input-trigger\client`、`@deepseek-ai/dsh-commands\types`。

#### A8. PluginHost — 插件控制台(zion 附加)
- **挂载**:AppFrame 底部。
- **交互入口**:「载入演示」/「禁区探针」(runtime.load, demo.ts)/「卸载」(runtime.unload);审批卡「拒绝/允许/批准并信任」(declineRun/approveRun false|true);运行控制台「刷新清单」(inventory);每行 版本 select + 运行(run|update)/停止(stopRow)/移除(removeRow)/重试下一版本/回滚 [zion-add, cordis 演示面]。
- **数据**:`usePlugins()`(runtime.active/runActivity/load/unload/inventory/runRow/stopRow/removeRow/approveRun/declineRun/subscribe/subscribeRuns)。

#### A9. SubagentPanel — 子代理面板(zion 附加)
- **挂载**:DetailsPanel(选中会话时)。
- **交互入口**:「刷新」(→ subagents.list);continuable 子代理 投递输入(Enter)+「发」(`subagents.prompt`)+「中断」(`subagents.interrupt`)[zion-add]。
- **数据**:`useSessions`(subagentsByParent[selected])、`subagentActions`、`selectedSessionId`。

#### A10. ToolCallCard — 工具调用卡 ✅ 已迁移(ZION 块 8+9,2026-08-27;demo: `ui-prototype/conversation/`)
- **挂载**:ChatView(tool-call 节点)。
- **交互入口**:`button.tool-card-row` 展开/收起;展开渲染 ToolBody(按 resultView.card: terminal/diff/结构化 dump/content blocks/args/error)[official]。
- **数据**:无 useRuntime;props `block`。内部 `MatrixDiffCard`/`ToolBody`。

#### A11. WorkspaceMenu — 工作区切换
- **挂载**:AppFrame 顶栏。
- **交互入口**:`button.shell-workspace`(开/关下拉);每工作区行「重命名」(行内输入+保存 → `workspaceActions.rename`)/「删除」(delete);「+ 新建工作区」→ `WorkspaceDirectoryBrowser`(B4;创建 → onCreated)[official]。
- **数据**:`workspaces`、`workspaceActions`;`WorkspaceDirectoryBrowser` 消费 host.listDirectory/createDirectory + workspace.create。

#### A12. SettingsShell — 设置
- **挂载**:Sidebar 页脚「⚙」触发;props `{ open, onClose }`。
- **交互入口**:关闭(✕/backdrop/Escape);分区导航 4 项(通用/模型/Agent 预设/插件);通用区 外观三 cube(→ settings.mutate ui-theme + applyTheme)/语言 select(mutate locale)/`PermissionSettingsRow`/`AgentPresetRowSeat`;模型区 Provider 行「编辑」→ ProviderEditPanel(API key 密码框+保存+清除 → credentials.set/unset;模型目录 添加/移除 → settings.mutate op set models;探活「探测」+「采用」→ llm.discoverModels)[official]。
- **插件分区**(`PluginsSettingsSection`,复刻官方 ui-settings-plugins 形态):标题「插件」+ intro + 两 tab[official];「插件配置」tab 三卡片(终端 shell / Agent 循环 agent-loop / 网页搜索 web-search-deepseek)——展开/字段编辑(已覆盖徽标+恢复默认)/保存(settings.mutate,revision 栅栏;网页搜索 API key 走 credentials.set)/放弃修改[official];「插件列表」tab 只读清单(pluginInventory/list)——三组(官方/MCP/社区)+ 组头计数 + 搜索(组内过滤)+ 状态点 + 已启用/已停用标签 + 展开详情(entryId/配置状态/Cordis 状态),社区行带「社区」徽标 + 展开说明「UI 注入面在复刻 UI 中未实现」[official 分组为 zion-add]。
- **数据**:`wire`(settings.describe/mutate、credentials.*、llm.providers/discoverModels、rpc pluginInventory/list)。

#### A13. QueueDock — 队列
- **挂载**:ConversationDock(有队列或 lastAgentError 时)。
- **交互入口**:每 queued 行「编辑」(行内输入+保存/取消 → `updateQueue(id,{kind:'edit',content:[{type:'text',text}]}`)/「插队」(steer)/「移除」(remove);lastAgentError 反馈条[official]。

### Part B — `renderer\src\app\`(座位/适配层)

> 座位把 vendor 官方组件注入面接 zion。重构若替换 vendor 组件,必须按此处重建注入面,否则丢 vendor 内部交互。

| 座位 | 文件 | 包裹 vendor 组件 | 注入 | 入口(经 vendor) | 关键数据 |
|---|---|---|---|---|---|
| agent-preset 四表面 | `agent-preset.tsx` | AgentPresetRow/Label/Seat/Section | controller store 经 bindSnapshotSelector | Row 默认预设选择;Seat chip 选择+introduced;Section 查看/复制两段/删除/设默认/打开目录/创作 → sessions.create | wire.api、useSessions、selectedSessionId;等位 SlotMap settings.general.item/settings.section |
| composer-stats 三 seat | `composer-stats.tsx` | ContextMeter/StatsLine/TodoDock | useProjection/useSession/sessionId/t | 上下文环+面板;统计条;todo strip(缺投影不渲染) | contextPressure/contextBreakdown/sessionStats/tokenUsage/todos |
| ComposerSeat | `composer-takeover.tsx` | ApprovalPanel / QuestionComposer / SubagentReadOnly | 选举 approval>question>只读>InputBar | 审批允许/拒绝;问答流+PlanReview;只读接管提示 | useConversation(pending/subagent/running) |
| WorkspaceDirectoryBrowser | `directory-browser.tsx` | DirectoryBrowser(ui-directory-picker-browse) | open/busy/listDirectory/createDirectory/onOpen/onClose/t | Miller 导航/新建文件夹/编辑路径/隐藏文件/打开→workspace.create | host.listDirectory/createDirectory、workspace.create |
| JobListActionSeat | `job-list-action.tsx` | JobListAction(ui-jobs) | sessionId/useSessions/t | 后台任务 badge + 任务列表 | useSessions jobsBySession |
| ModelSelectAdapter | `model-select.tsx` | ModelSelect(ui-model-selection) | directory(每会话 ModelDirectory)/load/select/available/locked/t | 两列菜单(模型/推理等级)+ Retry | sessions.models/selectModel |
| PermissionSettingsRow / PermissionChip | `permission-ui.tsx` | PermissionRow(ui-permission-presets) / PermissionSelectChip | controller(bindSnapshotSelector);usePermissions/useConversation | 默认预设选择(Full access 风险确认);chip → /permission | settings.describe/mutate;permissions 投影 |
| PlanSeat | `plan-seat.tsx` | PlanChip(ui-plan) | useProjection('plan')/locked/exitPlanMode/t | plan chip → /plan off | plan 投影 |
| ProducedFilesSeat / WorkflowRunSeat | `run-surfaces.tsx` | ProducedFiles(ui-deliverables) / WorkflowRunPanel(ui-workflow-run) | matched/openFile(host.openPath)/openSession(selectSession)/t | 产物 chip → 打开路径;workflow → 打开会话 | host.openPath、deliverables 累积、useSessions |
| SkillRowSeat | `skill-row.tsx` | SkillRow(ui-skill) | block/t | skill 工具行(无 Inspect,无 trajectory inspect 台账) | ToolCallBlock |
| SubagentCatalogActionSeat / SubagentReadOnlySeat | `subagent.tsx` | SubagentCatalogAction / SubagentReadOnlyComposer(ui-subagent) | openChild(selectSession)/refresh/setCatalogOpen/t | 目录树展开/打开子会话/刷新;只读提示 | subagentsByParent、wire.sessions.refreshSubagents |
| useTriggerPipeline | `trigger-menu.tsx` | InputTriggerController/MenuView(ui-input-trigger) + PopupSelectController/View(ui-commands) | roster 每会话(/命令 + /技能);usePermissions | MenuView 候选点击 → /name 落草稿;PopupSelect `/permission` → session.command | commands.list、skills.list、permissions 投影 |
| TrajectoryPane | `trajectory-pane.tsx` | TrajectoryView(ui-trajectory) | useSession/useDuration/loadOlder/setActualDuration/t | 轨迹视图(loadOlder/时长开关) | views.get('trajectory') |
| ConversationDock 汇编 | `conversation.ts`(非 UI) | 注册 chat/轨迹/deliverables/workflow-run Definitions | — | — | ConversationEventRegistry/ViewRegistry |

### Part C — `renderer\src\plugin\`(插件槽与 remote)

| 文件 | 导出 | 说明 |
|---|---|---|
| `anchors.tsx` | `SlotAnchor` | 附加型槽渲染器(list/keyed/single);**渲染面挂载的 6 槽**:`shell.overlay`、`conversation.input.dock`、`sidebar.footer.action`、`tool.call.toolview`(keyed)、`conversation.chat.assistant-actions`、`settings.plugin.item`(keyed)——不入删除范围 |
| `hub.tsx` | `PluginProvider` / `usePlugins` / `getPluginRuntimeHandle` | React hub;PluginRuntime+SlotRegistry+CordisRunOrchestrator;`__zionProbeHandleRemoteEvent` 探针钩子;setRpc 用 wire rpc 重建 remote |
| `remote.ts` | `createCordisRunnerRemote` | dynamicCordisRunner 桥(rpc.call /api/dynamicCordisRunner/<method>):inventory/runHostHalf/getClientCode/resolveRequestRun/settleUserRun/stopFromPanel/undefineFromPanel/invoke |

> 槽位白名单与主机位黑名单见 `plugin\slot-registry.ts` 的 `ADDITIVE_SLOT_SPECS`(注意:主机位 `root/conversation/sidebar/conversation.session/details/settings.close` 插件注册即拒,这是刻意的)。

### 1.3 插件槽详解:SlotAnchor slot="conversation.input.dock"(防误解必读)

> 本节回答三个高频误解:**「SlotAnchor 是什么组件」「conversation.input.dock 是什么功能」「插件状态卡从哪来」**。AI 重构/排查任何与 `slot` 标记、插件注入、composer 上方条条有关的问题,先读本节再动手。

**一句话定义**:`SlotAnchor` 是「**插件槽锚点**」——渲染面在某个位置画出一个「插座」;`slot="conversation.input.dock"` 是这个插座的名字(位置)。**插件**(client 半)通过 cordis 槽系统把条目注册进这个名字的插座,`SlotAnchor` 负责把注册进来的条目**按顺序渲染**出来。删掉 `SlotAnchor` = 丢掉**所有**插件往这个位置注入的入口(所以文档标记为 `[slot]`,受 AGENTS.md §8 铁律保护)。

**名字拆解**(英语直译,方便记忆):

| 片段 | 含义 |
|---|---|
| `conversation` | 会话(聊天主区域) |
| `input` | 输入(composer 输入条) |
| `dock` | 停靠(多条小条条纵向停靠的区域,像码头停船) |

合起来:**「会话输入区(composer 上方)的停靠排」**——官方条目与插件条目都停在这里,纵向按 order 排列。

**它是「锚点 + 列表槽」,本身不是功能组件**:

- 官方 cordis 语义:`conversation.input.dock` 是 `kind: 'list'`、`scope: 'session'` 的槽(官方 `client-ui-conversation/contract/slots.ts`),条目按注册 `order` 升序渲染;每个条目 = `{name, id, order, locale, 组件}`。
- **官方当前注册的真实条目**(即官方 UI 里这个位置实际显示的内容,也是 inspector `recipe input-dock` 召唤的并集):

| id(order) | 组件(渲染) | 数据来源(投影/注入) | 注册方 |
|---|---|---|---|
| `todo`(order 0) | TodoPanel 任务条(`data-testid="todo-panel"`) | `useProjection('todos')` | ui-conversation `todoDockEntry` |
| `goal` | GoalBar 目标条(`data-goal-bar`)/ GoalDock 适配器 | `useProjection('goal')` + 注入动作(onEdit/onPause/onResume/onClear)+ locale `t` | ui-goal |
| `queue` | QueueDock 队列行(`data-queue-dock`) | `useSession`(session/queue)+ updateQueue/notify | ui-conversation `queueDockEntry` |

- 条目**不直接持有数据**,一律通过槽系统注入的 props 拿数据:`useProjection(key)`(todos/goal)、`useSession`、注入动作、`t`。投影键缺失(附 A)⇒ 条目**静默消失**。
- 官方 UI 里这个位置**只有上述三个官方条目**;当前没有社区插件向官方 3080 注册此槽,所以「第三方插件卡片」在官方应用里**不存在真实形态**——它只存在于 zion 复刻(演示插件注入的「状态卡 / host.call 测试」卡,见下)。

**zion 侧的两条实现路径(别混为一谈)**:

1. **插件面(A7.2)**:`renderer/src/ui/InputBar.tsx` 内的 `SlotAnchor slot="conversation.input.dock"` —— 渲染**插件注册**的条目(zion 演示插件/社区插件 client 半,走 `plugin/` 运行时 + `ADDITIVE_SLOT_SPECS` 白名单)。本清单 A7.2 就是这个锚点。
2. **官方面(A7.3 / A6 / A13)**:官方三个条目的 zion 挂载,不走 SlotAnchor——`TodoDockSeat`(composer-stats 座位包 vendor TodoPanel,读 `todos` 投影)、`GoalBar`(A6,zion 自研,读 `useGoal`)、`QueueDock`(A13,独立组件)。

> 两者是**同一槽位的「插件注入面」与「官方内容」**,互不替代:插件条目经 SlotAnchor 渲染,官方条目经各自座位渲染。重构时**两个面都要保留**。

**插件怎么用这个槽**(给社区插件作者的契约):

- 插件 `apply(ctx)` 里 `ctx.slots.register({ name: 'conversation.input.dock', id: '<唯一id>', order: <数字>, locale: <ns> }, 状态卡组件)` → 卡片出现在输入框上方;
- 卡片组件拿到槽注入的 props(`useProjection`/`useSession`/注入动作/`t`),可读会话投影、可发起 host.call 测试(演示插件即此用法);
- zion 插件运行时只允许「附加型」槽(白名单见 `renderer/src/plugin/slot-registry.ts` 的 `ADDITIVE_SLOT_SPECS`);`root`/`conversation`/`sidebar` 等主机位**注册即拒**,这是刻意的(主机位由复刻 UI 独占)。

**怎么亲眼验证(别靠猜)**:

- 官方原版:inspector 真实配方 `node inspector/cli.mjs recipe input-dock --shot`(槽区真实条目并集截图:任务条 + 目标条 + 队列行[有排队才渲染]);`node inspector/cli.mjs summon goal-dock`(挂载官方 GoalDock 槽条目本体,mock `useProjection`,看条目 props 契约)。详见 `inspector/README.md`。
- zion 复刻:PluginHost「载入演示」后,输入框上方出现演示「状态卡 / host.call 测试」卡 —— 这就是 A7.2 标注的来源。

**重构/删除纪律**:

1. `[slot]` 标记项 = 动态插件槽锚点,**删除即丢失第三方/演示插件入口**;除非明确移除对应插件能力,否则禁止删除(AGENTS.md §8);
2. 条目渲染依赖投影键(`todos`/`goal`,附 A)——投影键缺一即条目静默消失,排查「条条不见了」先查投影;
3. 槽位名称/契约**零改动**(R2 wire 契约 + 插件运行时契约);改槽名 = 所有插件条目失效。

---

## 3. 交互入口总索引(防丢失 · 抽查对照表)

> 按出现位置排序;重构后逐行抽查「存在且可操作」。`标记`列:`official`(不可丢)/`zion-add`(可重设计)/`slot`(插件)。

| 位置 | 入口 | 触发动作 | 标记 |
|---|---|---|---|
| 顶栏 | 「新会话」`button.shell-new` | createSession | official |
| 顶栏 | 工作区下拉 `button.shell-workspace` | 切换/重命名/删除/新建 | official |
| Sidebar | 搜索框 | 本地过滤 | official |
| Sidebar | 视图选项(分组/排序 4 项) | 本地 view state | official |
| Sidebar | 「+」新建会话 | createSession | official |
| Sidebar | 行(选中、展开子代) | selectSession / 折叠 | official |
| Sidebar | 行 ⋯ 菜单(重命名/分叉/归档) | rename / fork / archive | official |
| Sidebar | 重命名 Modal | sessionRowActions.rename | official |
| Sidebar | 行/组头拖拽 | insertSessionBefore / insertBefore | official |
| Sidebar | 组溢出「+N」 | 展开折叠组 | official |
| Sidebar | 「⚙」设置 | 打开 SettingsShell | official |
| Sidebar | `SlotAnchor sidebar.footer.action` | 插件条目 | slot |
| 会话头 | 「会话层级」面包屑(`nav.conversation-header-crumbs`,点祖先段) | selectSession(父) | official |
| 会话头 | Chat/轨迹 tab | setView | official |
| 会话头 | AgentPresetLabelSeat | 只读标签 | official |
| 会话头 | SubagentCatalogActionSeat | 目录树展开/打开子会话 | official |
| 会话头 | JobListActionSeat | 任务 badge + 列表 | official |
| 会话 | 消息 复制/分支/时间戳 | clipboard / forkSession | official |
| 会话 | 消息图片 → Lightbox | readAttachment | official |
| 会话 | assitant 槽 `conversation.chat.assistant-actions` | 插件按钮 | slot |
| 会话 | tool 槽 `tool.call.toolview` | 插件工具视图 | slot |
| 会话 | ToolCallCard 折叠 | 展开/收起 | official |
| 会话 | SkillRow(skill 工具) | vendor 内部 | official |
| 会话 | 产物 chip | host.openPath | official |
| 会话 | workflow 卡 | selectSession | official |
| 会话 | QueueDock 编辑/插队/移除 | updateQueue edit/steer/remove | official |
| 会话 | streaming 提示 | 展示 | official |
| Composer | 触发管线 `/` 菜单 + popupSelect | session.command | official |
| Composer | `SlotAnchor conversation.input.dock` | 插件状态卡(详解见 §1.3) | slot |
| Composer | TodoDockSeat | vendor 内部 | official |
| Composer | GoalBar 设定/edit/pause/resume/complete/clear | goalActions.* | zion-add |
| Composer | PermissionChip → /permission | session.command | official |
| Composer | PlanSeat → /plan off | session.command | official |
| Composer | ModelSelectAdapter 两列菜单 | sessions.selectModel | official |
| Composer | 「+」命令列表 | pickCommand → /name 入草稿 | official |
| Composer | textarea(发送/换行/粘贴图) | sendPrompt / runCommand | official |
| Composer | 「📎」附件 + file input | readFiles | official |
| Composer | 整页拖放 + DropOverlay | 图片摄入 | official |
| Composer | AttachmentRail 缩略图/移除 | Lightbox / 删图 | official |
| Composer | 停止/发送 | session.cancel / prompt queue | official |
| Composer | ContextMeterSeat | vendor 内部(环+面板) | official |
| Composer | ComposerSeat 选举(approval/question/只读) | respond / 问答 / 提示 | official |
| 右栏 | SubagentPanel 刷新/投递/发/中断 | subagents.* | zion-add |
| 右栏 | `SlotAnchor settings.plugin.item` | 插件设置卡 | slot |
| 底部 | PluginHost 载入/卸载/审批三键/控制台六操作 | runtime.* | zion-add |
| 设置 | 关闭(✕/backdrop/Esc) | onClose | official |
| 设置 | 分区 4 项 | setSection | official |
| 设置 | 外观三 cube / 语言 / 权限行 / Agent 预设行 | settings.mutate / credentials / agentPreset | official |
| 设置 | Provider 编辑(API key/模型目录/探活) | credentials.* / settings.mutate / llm.discoverModels | official |
| 设置 | 插件分区:两 tab(配置三卡/列表三组) | settings.mutate / credentials / pluginInventory/list | official |
| WorkspaceMenu | 新建工作区 → Miller 目录弹窗 | host.listDirectory/createDirectory + workspace.create | official |

---

## 4. kimi code 重构完成后的验收命令

```bash
# 1) 类型与构建
npm run typecheck            # 错误面不超基线:对比 docs 记录(31 文件 / ~200 行;基线文件列表可另存)
npm run build:web            # 必须通过,dist/ 生成
npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort   # 起复刻预览

# 2) 功能回归(真后端 3080 常驻;探针: npx electron <probe>.mjs)
npx electron probe-checklist.mjs          # 24/24 全量回归
npx electron probe-takeover.mjs           # 审批/问答 composer 接管(fixture)
npx electron probe-permission-plan.mjs    # 权限行/chip + Plan chip
npx electron probe-composer-stats.mjs     # 上下文环/统计条/todo
npx electron probe-trigger.mjs            # / 触发菜单 + popupSelect
npx electron probe-subagent.mjs           # 子代理目录树/只读 composer
npx electron probe-jobs.mjs               # 作业 badge
npx electron probe-preset.mjs             # Agent 预设四表面
npx electron probe-directory.mjs          # Miller 目录弹窗
npx electron probe-cordis-panel.mjs       # 插件面板增强
npx electron probe-skill.mjs              # skill 行
npx electron probe-deliverables.mjs       # 产物/workflow
npx electron probe-queue-edit.mjs         # 队列行内编辑
npx electron probe-sidebar-drag.mjs       # 拖拽重排/溢出
npx electron probe-workspace-actions.mjs  # 行菜单/视图选项
npx electron probe-plugin-settings.mjs    # 插件设置分区(配置三卡/列表三组)
npx electron probe-queue-activation.mjs   # 队列激活(真后端;运行中排队 → QueueDock;探针自清理)
npx electron probe-msg-actions.mjs        # 消息复制/分支
npx electron probe-trajectory-real.mjs    # 轨迹视图

# 3) 入口抽查
按 §3 总索引逐行确认存在且可操作;视觉/布局改动另跑截图对照(vision-skills)。
```

> 想「亲眼看」官方组件的真实运行状态(而非读文字):`npm run start:inspector:fixture` 启动官方原版 UI + 组件召唤器(右下角「⿻ 组件」面板;AI 用 `node inspector/cli.mjs summon|recipe|raw|shot`),见 `inspector/README.md`。舞台 overlay 只支持官方模块**导出值**组件(如 ui-goal 的 GoalBar);未导出组件(TodoDock/TodoPanel、JobListAction)走真实配方(如 `/goal` 命令、fx-alpha 会话 todo 投影)。

> AGENTS.md 铁律:若本次重构包含删除既有展示元素/入口,先建 `ui-change-log/YYYY-MM-DD--<name>.md` 记录(删什么/为何/替代/验证)再删。

---

## 附 A. projection 键依赖(useProjection/useGoal/usePlanProjection/usePermissions 读取)

`goal`、`plan`、`permissions`、`contextPressure`、`contextBreakdown`、`sessionStats`、`tokenUsage`、`todos`、`imageLimits`(常量镜像);`useSessions` 读 `items/state/subagentsByParent/jobsBySession`;`useConversation` 读 `chat.order/nodes/timeline/running/composerPhase/pending/subagent/queue/lastAgentError/promptError`、`views.get('trajectory')`。

## 附 B. 重构防丢失速记(探索结论)

1. 入口密度最高 5 文件:InputBar / Sidebar / SettingsShell / PluginHost / GoalBar —— 重构必须逐入口回归。
2. 所有 UI 动作出口经 `useRuntime()`(runtime.tsx):保留 action 调用即不丢功能。
3. 座位(seat)只做 vendor 注入面:换 vendor 组件必须按 Part B 表重建 `useXxx/load/select/t` 等注入,否则丢 vendor 内部交互。
4. 6 个渲染面插件槽不可删(`shell.overlay` / `conversation.input.dock` / `sidebar.footer.action` / `tool.call.toolview` / `conversation.chat.assistant-actions` / `settings.plugin.item`)。
5. projection 键清单(附 A)是「某入口能否渲染」的数据前提,重构后投影键缺一即入口静默消失。
