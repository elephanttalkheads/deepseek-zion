# DeepSeek Zion「全 UI 层对照官方展示内容零缺失」数据可行性审计

> 审计人：zion 官方内容可行性审计（只读，未改任何文件）
> 对照基准：`D:\pi-martix-ui-dev\docs\ui-inventory\00-INDEX.md` + 12 个分卷（`01-shell-core.md` … `12-cordis-extensions.md`）
> 审计对象：zion 当前数据层 = `renderer/src/protocol/assemble.ts` + `renderer/src/plugin/remote.ts` + `renderer/src/app/runtime.tsx` + `renderer/src/app/conversation.ts` + 10 个手写 UI + 5 个 vendored 包（`client-connection`/`client-runtime`/`client-ui-conversation`/`client-ui-slots`/`client-web-react`）
> 产出日期：本会话
> 三色语义：🟢 数据已具备（zion wire/数据层能拿到渲染该组件所需数据 → 可直接 Matrix 化）；🟡 数据需补（缺 projection/RPC/wire 面，列出缺什么）；⚪ 官方本身未接线（官方源码自己也没渲染 → 可不做）。

---

## 0. 一页结论（先看这里）

zion 的 B 直拼数据层**内核已具备官方 wire 的全部「只读展示」数据通道**——因为 vendored 的是官方 `client-runtime`（`SessionManager`/`Session`/`ProjectionValueStore`）+ 官方 `client-connection` fixture。也就是说：

1. **所有「会话投影」类内容（ContextMeter/TodoPanel/GoalBar/PlanChip/PermissionSelect/StatsLine)在 wire 上数据全在**（fixture 的 `projectionValuesOf` 已推 `contextPressure/contextBreakdown/todos/goal/plan/permissions/sessionStats/tokenUsage/imageLimits`），但 zion 的 `AppRuntime` 目前**没有暴露 `useProjection` hook**——这是「少绑一行 uSES」的接线缺口，不是缺数据面 → 一律标 🟢（数据在，需跑一步绑定）。
2. **真正喂不动的有三类**：
   - **轨迹视图（ui-trajectory）**：zion 只 vendor 了 `ui-conversation`，没有 vendor `ui-trajectory`，其 `conversation.view` 的 `trajectory` 视图定义与 `TrajectorySnapshot` projection **完全缺失**（`views.get('trajectory')` 恒为 undefined）→ ❌ 当前 B 直拼无法实现。
   - **写路径动作（point 写）**：所有「chip 点击 → 执行命令」都要经 `remote.commands.execute`，而 zion 的 `noopRemote.commands.execute` **抛错「not wired in M1」**（`assemble.ts` L26-30）。所以 `/permission`、`/plan off`、`/goal`、`/command` 的**写入侧全堵死**（展示侧数据在）→ 🟡。
   - **少数 RPC 桥缺失**：`messageFeedback`（list/put/delete）、`pluginInventory.list`、`commands/list` 未在 zion 侧对接（fungible RPC 通道在，但没桥），fixture 也不实现 → 🟡。
3. **Matrix 化（套视觉）不受数据层阻碍**——所有 🟢 项可立即 Matrix；🟡 项补完对应接线即可；⚪ 项官方没画可直接跳过。

---

## 1. 总表：官方组件/内容项 × zion 数据层 × 三色

> 官方源码位置沿用 00-INDEX/分卷的相对路径；「zion 数据层」列 = 用哪个通道能取到数据。

### 1.1 外壳与原子库（分卷 G1 → `01-shell-core.md`）

| 组件/内容项 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| AppRoot 装载页/失败页 | `packages/client/web/src/AppRoot.tsx` | `connectionState`（connecting/connected/reconnecting）已暴露 | 🟢 | 无（数据在；zion 现直接渲染，未做 boot settle 装载面） |
| DocumentTitle（浏览器标题投影） | `packages/client/web/src/DocumentTitle.tsx` | `useSessions` 有会话 title | 🟢 | 无（纯副作用 UI） |
| ui-primitives 34 原子（Button/Menu/Modal/HoverCard/JsonTree/Terminal/Diff/Read/Search/Web/Code/Markdown/MessageText/StateDot/DisclosureRow/ConnectionBanner/Toaster…） | `packages/client/ui-primitives/src/` | 纯 props 原子，无 wire 依赖 | 🟢 | 无（手写原子即可；zion 目前未实现这套原子库） |
| 70 个 `ic_ds_*` 图标 | `packages/client/ui-primitives/src/icons/` | 静态 SVG path | 🟢 | 无 |
| Appearance 外观设置行 | `packages/client/ui-theme/src/client/AppearanceRow.tsx` | 需 `settings.theme` 偏好 + 主题 runtime | 🟡 | zion 无 theme runtime 与 setTheme；需补主题服务 + `settings.describe` 读偏好 |
| Language 语言设置行 | `packages/client/locale/src/client/LanguageRow.tsx` | 需 locale runtime（zh/en） | 🟡 | zion 无 locale runtime；需补字典表 + 偏好读 |
| 主题 5 张 token 样式表 / 滚动条 / shiki | `ui-theme/src/styles/*.css` | token 常量 | 🟢 | 无（纯样式；zion 的 styles.css 需按 token 体系重建） |
| connection / `?fixture` 传输层 | `packages/client/connection/src/` | **已具备**（`assemble.ts` pick fixture/WebApiClient + `ConnectionController`） | 🟢 | 无 |

### 1.2 布局/侧栏/工作区/附件（分卷 G2 → `02-layout-sidebar.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| AppFrame（三栏 + 拖把 + 主题 presenter） | `ui-layout/src/client/AppFrame.tsx` | **已具备**（`AppFrame.tsx` 已是三栏） | 🟢 | 拖拽把手/折叠轨道未做（纯增强） |
| SidebarRoot（品牌行/新会话/折叠/底部设置） | `ui-sidebar/src/client/SidebarRoot.tsx` | `useSessions` + `workspaces` | 🟢 | 底部 Settings 座位触发面板未做（Settings 全缺） |
| WorkspaceBrowser（分组/平铺/搜索/会话列表 + 3 Modal） | `ui-workspace/src/client/WorkspaceBrowser.tsx` | `sessions.list`（已暴露）+ `sessions.search` RPC + `workspace.*` RPC（rename/delete/insertBefore/insertSessionBefore/archiveSession） | 🟢 | rename/delete/archive 等写动作未在 runtime 暴露；分组/平铺 store 未做 |
| WorkspacePicker / PickFlow（hero 空态拾取/添加） | `ui-workspace/src/client/WorkspacePicker.tsx` | `workspace.list/create` + `host.listDirectory/createDirectory` | 🟢 | hero 空态拾取 UI 未做（zion ConversationDock 仅静态标题） |
| ProjectRow/SessionNodeItem/SearchResultItem 行 | `ui-workspace/rows/Rows.tsx` | sessions/workpaces 快照 | 🟢 | 纯表现行 |
| AttachmentRail（草稿缩略图轨道） | `ui-attachment/src/AttachmentRail.tsx` | `imageLimits` projection + 本地草稿 images | 🟢 | zion 只在 InputBar 内联了图片 chip，未做独立轨道组件 |
| MessageImage / ImageGallery（历史图） | `ui-attachment/src/MessageImage.tsx` | `session.attachment` RPC + 节点 image block (`ImageAttachmentRef`) 在 vendored 对话里有 | 🟢 | 未渲染历史图片 |
| ImageLightbox（原图灯箱） | `ui-attachment/src/ImageLightbox.tsx` | 同上 | 🟢 | 未实现 |
| DropOverlay（整页拖放层） | `ui-attachment/src/DropOverlay.tsx` | 前端本地 | 🟢 | 未实现 |

### 1.3 对话域（分卷 G3 → `03-conversation.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| ConversationRoot（hero→composer→session 骨架） | `ui-conversation/skeleton/ConversationRoot.tsx` | `composerPhase`（blank/engaging/active）+ `openState` | 🟢 | zion 已用 `composerPhase`；hero 内容极简 |
| 12 对话节点 kind（user/steering/context/assistant-step/command/manual-compaction/compaction/model-retry/turn-error/turn-max-tokens/turn-tail/unknown） | `ui-conversation/chat/*` + `conversation-nodes/*.ts` | **已具备**：`conversation.ts` 已跑 vendored `registerConversationNodes`，`ChatSnapshot.nodes` 产出全部 12 类节点 | 🟢 | **zion 现把它们渲染成纯文本**（ChatView `nodeBody`），需按节点种类 Matrix 化渲染（ReasoningRow/CompactionItem/TurnStatus/MessageIconActions 等）——数据在，渲染是手写活 |
| AssistantMarkdown（markdown + TeX 正文） | `ui-conversation/chat/*` | 节点 blocks.text | 🟢 | zion 无 markdown 渲染器（用纯文本） |
| InputBar（textarea/附件/权限/模型/ContextMeter/Send） | `ui-conversation/input/` | 已具备（`InputBar.tsx`） | 🟢 | 权限 chip/ContextMeter/命令`+` 按钮未接 |
| **ContextMeter（上下文环 + breakdown）【L2】** | `ui-conversation/skeleton/ContextMeter.tsx` | `contextPressure` + `contextBreakdown` projection **在 wire 上** | 🟢 | 需在 runtime 加 `useProjection('contextPressure'/'contextBreakdown')` 绑定（少一行 uSES） |
| **ApprovalPanel（审批接管 composer）【L4】** | `ui-conversation/skeleton/ApprovalPanel.tsx` | `pending` approval + `PendingWait.respond`（vendored `pending.ts`）已到位；`InteractionDock` 已在渲染审批卡 | 🟢 | 官方是「替换 composer 整体」；zion 是「composer 上方独立卡」——布局差异，数据够 |
| **TodoPanel / TodoDock（计划条）【L3】** | `ui-conversation/skeleton/TodoPanel.tsx` | `todos` projection **在 wire 上** | 🟢 | 需绑 `useProjection('todos')`；zion 无此 UI |
| **QueueDock（edit/delete/steer 完整交互）【L5】** | `ui-conversation/queue/QueueDock.tsx` | `queue` 快照 + `updateQueue` **已具备**（`QueueDock.tsx` 有 remove/steer）；fixture `sessions.updateQueue` 返回 not-found（无待排项） | 🟡 | fixture 无 queue item，`updateQueue` 走不通；**edit 模式**未实现（只 remove/steer）；180px 上限/折叠未做 |
| **DetailsPanel（工具详情右列）【L6】** | `ui-conversation/skeleton/DetailsPanel.tsx` | 官方 `openDetails` **未被调用** | ⚪ | **官方也没画/没接线 → 可不做**（zion `DetailsPanel.tsx` 是占位即可） |
| EmptyHero（HeroShell/WorkspaceChip）【L1】 | `ui-conversation/skeleton/ConversationRoot.tsx` 内 | `workspaces` + `useSessions` + `workspace.create` | 🟢 | zion 静态 hero 无 workspace 选择器 |
| StatsLine（统计条）/ TurnStatus / MessageIconActions | `ui-conversation/chat/*` | `sessionStats`/`tokenUsage` projection + nodes 的 turnTail 数据 | 🟢 | 需绑 projection + 手写渲染 |
| CompactionItem / ContextInjectionRow / ContextBody / RetryItem / TurnErrorItem / TurnMaxTokensItem | `ui-conversation/chat/*` | vendored 节点数据全在 | 🟢 | 手写渲染 |
| EnterBehaviorRow（busy Enter=Queue/Steer 设置） | `ui-conversation/settings/EnterBehaviorRow.tsx` | `settingsScope` 持久化 | 🟡 | zion 无 settingsScope 服务 + 无此设置行 |
| ConversationSession / Header（crumb/actions/utilities/tabs） | `ui-conversation/skeleton/*` | 会话快照 + views | 🟢 | view tabs（聊天/轨迹）只有 chat 可用；轨迹 tab 缺（见下） |

### 1.4 工具域（分卷 G4 → `04-tool.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| ToolCallTree / ToolCallBranch / GenericToolCard / ToolRow | `ui-tool/src/client/` | **已具备**：vendored `ToolCallBlock`（RunningToolCall/ToolResultNode）含 `callView`/`resultView`（card: terminal/read/diff/search/web）+ `subCalls` 递归 | 🟢 | zion `ToolCallCard.tsx` 已渲染折叠行 + Matrix diff 卡；但未做整行 toggle/Inspect/path 链接/树递归 |
| 10 个 key toolview（bash/read/edit/write/grep/glob/web_search/web_fetch/todo_write/ask_user_question） | `ui-tool/src/client/tool/toolviews/*.tsx` | resultView.card 数据在；`resolveWorkspacePath` 需 session cwd | 🟢 | 手写各卡；`ask_user_question` 的问题 UI 在 composer 接管（见 InteractionDock） |
| ToolDetails（`conversation.details.tool`） | `ui-tool/src/client/ToolDetails.tsx` | 卡 model 数据在 | ⚪ | 官方 DetailsPanel 未接线 → 此子槽连带可不做 |
| skill toolview（SkillRow） | `ui-skill/src/client/SkillRow.tsx` | `skill.list` RPC（fixture 有 2 个） | 🟢 | 手写 SkillRow；zion 无 `/` 技能 source（见 1.5） |

### 1.5 输入触发/命令/技能/子代理（分卷 G5 → `05-input-commands.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| MenuView（`/` `@` 触发候选菜单） | `ui-input-trigger/src/client/MenuView.tsx` | 需 input-trigger 管线：`commands/list`、`skill.list`、subagent source | 🟡 | zion **无 `/` `@` 输入触发管线/controller/MenuView**；`remote.commands.execute` noop |
| PopupSelectView（命令 popupSelect 外壳 + 风险确认） | `ui-commands/src/client/PopupSelectView.tsx` | 需 `command.list`（fixture rpc `commands/list` 有）+ popup 状态机 | 🟡 | zion 无 popupSelect 外壳/CommandUi runtime；`commands/list` 未桥接 |
| 命令执行结果行（GenericCommandCard/CompactionCommandCard，`conversation.chat.commandview`） | ui-conversation 侧 | vendored CommandNode 数据在（`conversation.ts` CommandNode） | 🟢 | 数据在；zion 渲染成文本命令行 |
| SkillRow / `/` skill source | `ui-skill/` | `skill.list` RPC 有 | 🟢 | 需建 skill source + 行卡（写 /{name} 字面量，无需命令执行） |
| SubagentCatalogAction（子代理目录树） | `ui-subagent/src/client/SubagentCatalogAction.tsx` | `subagents.list` RPC（fixture 返回空 entries）+ `sessions.list` parentId/depth | 🟢 | fixture 空 → 树上无子代理；数据面在 |
| SubagentReadOnlyComposer（只读 composer 接管） | `ui-subagent/src/client/SubagentReadOnlyComposer.tsx` | 会话 `subagent.address`（vendored ConversationSnapshot.subagent） | 🟢 | 数据在；zion 未接 composer 接管链 |

### 1.6 轨迹/工作流/交付物（分卷 G6 → `06-trajectory-workflow.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| **TrajectoryView（Toolbar/Timeline/Table + 右侧详情检查器）** | `ui-trajectory/src/client/` | `conversation.view` 的 `trajectory` 视图定义 + `TrajectorySnapshot` projection **zion 未 vendor、未注册** | ❌ | **无法在 B 直拼下实现**：zion 只 vendor `ui-conversation`（只注册 `chat` view target），`views.get('trajectory')` 恒 undefined。需 vendor `ui-trajectory` + `registerTrajectoryConversationView` + 其 6 个 Context 定义 |
| 旧版 TrajectoryCell/Turn/TurnHeader/GroupHeader | `ui-trajectory/src/client/` | 官方未接入 | ⚪ | **官方没画，可不做** |
| WorkflowRunPanel（`conversation.chat.node` key=workflow-run） | `ui-workflow-run/src/client/` | 需 `tool-workflow/*` 会话事件（`tool-workflow/run-start`/`agent-start`/`agent-end`/`run-end`）+ workflow-run 节点定义 + `useSessions` 成员导航 | 🟡 | zion 未 vendor `ui-workflow-run`、未注册 workflow-run 节点定义；需补定义 + 节点渲染 |
| ProducedFiles（消息尾部产物行 + 行内文件提及） | `ui-deliverables/src/client/` | 数据在：mutation 工具结果 `locations`（diff/edit 卡）；但需 `conversation.chat.turnTail` 的 `selectProducedFiles` 定义 | 🟡 | zion 未 vendor `ui-deliverables`、未注册 deliverables 折叠器；需补 turnTail 定义 |

### 1.7 Goal/任务/反馈/提问（分卷 G7 → `07-goal-jobs-feedback.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| GoalBar / GoalDock（`conversation.input.dock` order10） | `ui-goal/src/client/GoalBar.tsx` | `goal` projection + `goals.*` RPC（fixture 全实现） | 🟢 | 需绑 `useProjection('goal')` + 暴露 goals 写动作；`/goal` 创建命令走 commands.execute（noop） |
| GoalCommandInputView（`/goal` 命令气泡） | `ui-goal/src/client/GoalCommandInputView.tsx` | `command/run` 事件（vendored CommandNode 变体） | 🟡 | 需 goal-command-input 节点定义（zion 未注册该 key） |
| JobListAction（会话头任务 badge + popover） | `ui-jobs/src/client/JobListAction.tsx` | `jobsBySession` 列表镜像（runtime 从 `session/jobs` 帧折叠） | 🟡 | fixture 现不推 `session/jobs` 帧；zion 未确认 manager 折叠 job 帧；需 job 帧喂入 |
| MessageFeedbackActions（赞/踩 + 备注） | `ui-message-feedback/src/client/` | 需 `ctx.remote.messageFeedback`(list/put/delete) CAS | 🟡 | zion 未桥 messageFeedback RPC，fixture 也未实现；需补该 RPC 面 |
| QuestionFlow / PlanReviewPanel | `ui-user-questions/src/client/` | `pending` question + `PendingWait.respond`（vendored） | 🟢 | zion `InteractionDock` 已在渲染问题卡；PlanReview（plan intent）未区分 |

### 1.8 模型/权限/计划/预设/目录（分卷 G8/G9 → `08`/`09`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| `/model` popupSelect + composer 模型席位（模型/Effort 两级菜单） | `ui-model-selection/` | `sessions.models` + `selectModel` **已暴露**（`session.models` RPC 有，含 reasoning.efforts） | 🟢 | zion 用 `<select>` 而非官方两级 Menu；弹出弹窗未做。数据够 |
| 权限 preset（General 行 + `/permission`）→ **Full access 风险确认【L10】** | `ui-permission-presets/` | `permissions` projection **在 wire 上** | 🟢 | 需绑 `useProjection('permissions')`；**写入走 `/permission <preset>` 命令 → commands.execute noop 堵死** |
| PlanModeControl（plan chip） | `ui-plan/src/client/PlanModeControl.tsx` | `plan` projection **在 wire 上** | 🟢 | 需绑 `useProjection('plan')`；**退出走 `/plan off` → commands.execute noop 堵死** |
| AgentPresetSeat/Label/Row/Section（四表面 + copy/删除 Modal） | `ui-agent-preset/` | `agentPreset.list/select/read/copy/openDocument/remove` RPC **fixture 全实现** | 🟢 | zion 无这些 UI；数据面全齐 |
| DirectoryBrowser（Miller 列） | `ui-directory-picker-browse/` | `host.listDirectory/createDirectory`（fixture 有，含隐藏/截断/crumbs） | 🟢 | 手写 Miller 列对话框 |
| NativeDirectoryFlow | `ui-directory-picker-native/` | `host.pickDirectory`（fixture 返回固定路径） | 🟢 | 无 DOM（OS 对话框） |
| DirectoryBrowser「延迟 Loading」「隐藏文件 toggle」等细节 | 同上 | 数据在 | 🟢 | 手写交互 |

### 1.9 设置体系（分卷 G10 → `10-settings.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| SettingsRoot（模态外壳 + 左导航 + 3 section） | `ui-settings-general/` | `settings.section` 槽 + `settingsScope` | 🟡 | zion **无 Settings 面板/外壳**；需补 settingsScope + slot 渲染 |
| ModelsSection / ProviderEditor / 编辑器 / CustomProviderCard / Onboarding | `ui-settings-models/` | `llm.providers/models` + `settings.describe` + `credentials.*` RPC 都在 | 🟡 | fixture 只提供**只读最小 llm-deepseek descriptor**，`settings.update/mutate` fixtures 全部 reject；真正可写编辑需真后端 |
| PluginInventorySettingsTab（只读清单） | `ui-settings-plugin-inventory/` | 需 `remote.pluginInventory.list` | 🟡 | zion 未桥 pluginInventory RPC，fixture 未实现 |
| PluginsSettingsSection + 三张插件配置卡（Bash/AgentLoop/WebSearch）+ ValueField/SecretField | `ui-settings-plugins/` | `settings.describe`（served ns）+ `credentials.describe/set` | 🟡 | 数据面有但 zion 无 UI 外壳/卡片；credentials.set 写路径在 |
| 凭证 UI（API key 走 `credentials.set`） | `ui-settings-models/apiKey.ts` | `credentials.describe/set/unset` RPC（fixture 有，回 file 源） | 🟡 | 无 UI；`settings.update/mutate` 只读受限 |

### 1.10 主题/语言/连接（分卷 G11 → `11-theme-locale-connection.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| **ConnectionBanner（断线重连横幅）【L9】** | `ui-primitives/ConnectionBanner.tsx` | `connectionState` **已暴露**（reconnecting 可判） | 🟢 | 未渲染横幅（AppFrame 有 `data-connection`） |
| AppearanceRow / LanguageRow | `ui-theme`/`locale` | 需 theme/locale runtime | 🟡 | zion 无 theme/locale runtime（见 1.1） |
| `?fixture` 无后端跑全套 | `connection/fixture.ts` | **已具备** | 🟢 | 无 |

### 1.11 Cordis 扩展（分卷 G12 → `12-cordis-extensions.md`）

| 组件 | 官方源码位置 | zion 数据层能否喂 | 三色 | 缺什么 |
|---|---|---|---|---|
| **CordisDefineRow / CordisRunRow（toolview key=cordis_define/run/stop/undefine/inspect）【L8】** | `extensions/ui-cordis/src/client/` | `dynamicCordisRunner` remote **已桥**（`remote.ts`）+ `tool.call.toolview` keyed 槽 + `host/remote-event` 分发（`handleRemoteEvent` cordis/request-run） | 🟢 | zion `PluginHost` 是调试条非官方卡；需把 `tool.view.cordis`(key=`self`) 运行卡 + define/run 行按官方 card 渲染 |
| CordisPanel（侧栏插件面板入口） | `extensions/ui-cordis/src/client/CordisPanel.tsx` | `sidebar.footer.action` 槽 + 运行编排（orchestrator） | 🟢 | zion 有槽/有编排，未做面板 UI |

---

## 2. 三色分层汇总

### 🟢 数据已具备（可直接 Matrix 化）——约 40+ 项

外壳（AppRoot/DocumentTitle/34 原子/70 图标/主题 token/连接层）、AppFrame/SidebarRoot/WorkspaceBrowser/Picker/3 行组件、附件 4 原子（数据在）、对话 12 节点 & 其辅助组件、**ContextMeter / TodoPanel / GoalBar / PlanChip / PermissionSelect / StatsLine（6 个 projection 项，wire 数据在，需绑 useProjection）**、InputBar、QueueDock(数据)、EmptyHero、Tool 卡与 8 个 toolview、SkillRow、SubagentCatalog/ReadOnlyComposer、QuestionFlow/PlanReview、模型席位与 `/model`、AgentPreset 四表面、DirectoryBrowser、NativeFlow、ConnectionBanner、**Cordis define/run 行/面板**、`?fixture`。

> 注：🟢 项「数据已具备」≠「UI 已画出」。本项目当前阶段是「复刻官方展示内容 1:1」，绝大多数 🟢 项需要「手写官方形态的组件」把已有数据渲染出来（如 markdown、reasoning 折叠、toolview 各卡、ContextMeter 环）。数据层不构成障碍，Matrix 化可直接套。

### 🟡 数据需补（缺 projection/RPC/wire 面）——约 14 项

QueueDock edit 模式 + 可排队 fixture、Appearance/Language 行（theme/locale runtime）、EnterBehaviorRow（settingsScope）、Settings 全部（外壳/Models/Plugins/PluginInventory）、凭证 UI（只读 fixture）、MessageFeedback、Jobs、Trajectory（见下归入无法实现）、WorkflowRun、ProducedFiles、GoalCommandInput（命令气泡 key）、`/` `@` 触发管线（MenuView/PopupSelect）、诊断路径（commands.execute noop）。

### ⚪ 官方本身未接线（可不做）——3 项

- **DetailsPanel（L6）**：官方 `openDetails` 未被调用，官方自己也没画 → 明确可不做（zion 保持占位）。
- **Trajectory 旧版 4 组件**（TrajectoryCell/Turn/TurnHeader/GroupHeader）：官方无 import，未接入渲染路径 → 可不做。
- **NativeDirectoryFlow**：renderless（OS 对话框），浏览器 0 可见元素 → 无 UI 可做（仅模拟外部结果回流）。

### ❌ 无法在 zion B 直拼下实现（需 cordis/服务/额外 vendor）——1 项核心

**TrajectoryView（+ 其详情检查器）**：需要 `ui-trajectory` 包的视图定义、`TrajectorySnapshot` projection 投影、以及 6 个 context 贡献定义，zion 未 vendor、未注册，`views.get('trajectory')` 恒 undefined → 当前 B 直拼**无法实现**，除非增 vendor `ui-trajectory` 包并注册其视图。

---

## 3. 🟡 项「缺什么数据面」明细（哪些 projection/RPC 需补）

| # | 组件 | 缺的数据面 | 补法（在 zion B 直拼下） |
|---|---|---|---|
| 1 | **Appearance/Language 设置行** | 主题 runtime `ctx.theme`（preference + change）、locale runtime `ctx.locale`（zh/en 字典 + change） | runtime.tsx 加 `useTheme()`/`useLocale()` 服务；偏好经 `settings.describe` 读、写需 `settings.mutate`（loopback 才可写） |
| 2 | **EnterBehaviorRow** | `settingsScope`（`settings.describe/mutate` revision-fenced） | 新增 settingsScope 服务 + 设置行 slot；fixture 只读受限 |
| 3 | **Settings 外壳 + General/Models/Plugins 页** | `settings.section` 槽渲染 + `settings.describe/mutate/update/replace` 可写 schema + onboarding | 写 UI 外壳；真可写 schema 需真后端（fixture 全 reject update/mutate） |
| 4 | **凭证/API key（Models/WebSearch）** | `credentials.describe/set/unset`（已有 RPC）但无 UI + fixture 仅回「file」源、不可写 | 接 UI；写需 loopback 后端 |
| 5 | **PluginInventorySettingsTab** | `remote.pluginInventory.list()` RPC **未桥、fixture 未实现** | 在 remote.ts 加 pluginInventory 通道 + fixture `pluginInventory.list` 实现 |
| 6 | **MessageFeedbackActions** | `ctx.remote.messageFeedback`(list/put/delete) CAS **未桥、fixture 未实现** | remote.ts 加 messageFeedback 通道 + 每会话 controller + fixture 实现（CAS 由后持） |
| 7 | **JobListAction** | `session/jobs` 帧 → `jobsBySession` 列表镜像（manager 折叠）**fixture 现不推 job 帧** | 确认/补 manager 对 `session/jobs` 的折叠 + fixture 推 job 帧 |
| 8 | **WorkflowRunPanel** | 缺 `tool-workflow/*` 事件 → `workflow-run` 节点定义 + `conversation.chat.node` key 注册 | 补 workflow 会话事件折叠器 + 节点定义（数据随 history 事件重放） |
| 9 | **ProducedFiles** | 缺 `conversation.chat.turnTail` 的 `selectProducedFiles` 定义（数据在 tool result locations） | 补 deliverables 折叠器（turn/start+tool/call+tool/result → locations）注册到 turnTail |
| 10 | **GoalCommandInput** | 缺 `command-input` 节点定义（`/goal` 气泡） | 补 goal-command-input 定义（消费 command/run） |
| 11 | **`/` `@` 触发菜单 MenuView** | 缺 input-trigger 管线：`commands/list`（rpc 有但未桥）+ skill source + subagent source + detect/arbitrate 状态机 | 桥 `commands/list` + 建 source 注册表 + 实现 MenuView（combobox），anchor `conversation.input.overlay` |
| 12 | **popupSelect 外壳（含 `/model` `/permission` 命令弹窗）** | 缺 CommandUi runtime + PopupSpec 状态机 + 风险确认 | 建 popupSelect 外壳 + `commandUi.register/decorate`；写提交走 `command.execute` |
| 13 | **QueueDock edit 模式 / 可排队** | `updateQueue` 的 edit 动作已暴露但 UI 未实现 edit；fixture 无 pending 排队项（updateQueue 返回 not-found） | 实现 edit 表单；fixture 需产出 queued 项才可验收 |
| 14 | **所有「写路径」命令（PermissionSelect 提交 / Plan off / Goal 创建 / 命令执行）** | `remote.commands.execute` 为 noop（`assemble.ts` noopRemote **抛错**） | 把 noopRemote.commands.execute 接真 `commands/execute` RPC（fixture 的 `commandRemotes.execute` 已实现）——**这是最大的一处数据层接线缺口** |

---

## 4. 特别结论：官方内容在 zion B 直拼下能否实现——分层判据

### 4.1 官方内容在 zion B 直拼下**能**实现（数据已在 vendored wire / fixture 上）

几乎所有「**只读展示**」类内容都能，因为 zion 直接消费官方 vendored 数据层：

- **会话投影全家桶**（ContextMeter/Todo/Goal/Plan/Permission/StatsLine/ImageLimits）→ wire 的 `ProjectionValueStore` + fixture 已推，补 `useProjection` 绑定即可。
- **对话流 12 节点 + 工具树 + 8 toolview** → vendored `registerConversationNodes` 已产出全部节点 + `ToolCallBlock`(callView/resultView) 递归。
- **工作区/侧栏/会话列表/搜索/重命名/归档/工作区 CRUD** → `sessions.*`/`workspace.*` RPC fixture 全实现。
- **AgentPreset 四表面、目录选择、技能、子代理、附件、连接横幅、审批/提问 pending、Cordis run 编排 + define/run toolview + 面板** → 对应 RPC/remote/槽都在。

### 4.2 官方内容在 zion B 直拼下**无法**实现（需要额外 vendor / cordis 服务 / 真后端）

1. **轨迹视图 TrajectoryView（含右侧详情检查器）**：唯一的「整块官方 UI」缺失——需 vendor `ui-trajectory`（~6 个 Context 定义 + `TrajectorySnapshot` 投影）并注册 `conversation.view` 的 trajectory；这超出「B 直拼现成 data layer」，不算纯数据缺口而是「缺官方视图定义 vendor」。
2. **可写设置编辑器（Models provider 管理 / Plugins 配置 / Onboarding 完整 schema）**：真正的 `settings.update/mutate` 可写 schema + `llm.discoverModels` 候选 Modal 需要**真后端**（fixture 只读、discoverModels 指向幻想端点）。B 直拼下可画壳，但「保存生效」必须在 loopback 真宿主上。
3. **MessageFeedback / PluginInventory 的写或读面**：fixture 与 zion remote 都未实现对应 RPC 通道（需补桥 + fixture 实现，或接真后端）。

### 4.3 需要 cordis/服务才能实现、但 B 直拼可「绕过」或「已绕过」的

官方 UI 的写路径动作几乎都经 `ctx.remote.commands.execute`（`/permission`、`/plan off`、`/goal`、`/compact` 等）。zion 用 `noopRemote.commands.execute` 堵死 → 这些 chip **展示可画，点击执行需接线**。好消息：fixture 的 `commandRemotes.execute` 已实现在 `world.rpc`（`commands/execute`），且 `createCordisRunnerRemote` 已示范「零 cordis 直发通用 Connection RPC」的桥写法——**zio 只需把 `noopRemote.commands.execute` 替换为经 `createWebConnectionRpc()` 发 `commands/execute` 的桥即可解封全部写路径**，不改架构。

---

## 5. 逐 L 项（L1–L10）判定速查

| L | 内容 | 判定 | 一句话 |
|---|---|---|---|
| L1 | hero 空态 / workspace 选择 | 🟢 | data 在，UI 未做；可 Matrix |
| L2 | ContextMeter 上下文环 | 🟢 | wire 有 projection，补 `useProjection` 绑定 |
| L3 | TodoPanel 计划条 | 🟢 | wire 有 `todos` projection，补绑定 |
| L4 | ApprovalPanel 接管 composer | 🟢 | `pending` + `PendingWait.respond` 已有；布局改为替换 composer |
| L5 | QueueDock 完整交互（edit/steer） | 🟡 | remove/steer 已接；edit 模式未做 + fixture 无排队项 |
| L6 | DetailsPanel | ⚪ | 官方未接线，可不做 |
| L7 | 附件全流程（拖放/灯箱/历史图） | 🟢 | `imageLimits`/`session.attachment`/节点 image block 在，UI 未做 |
| L8 | Cordis define/run 卡片 + 插件面板 | 🟢 | `dynamicCordisRunner` remote + 编排 + 槽都齐，UI 做成官方卡即可 |
| L9 | 连接横幅 / 重连 | 🟢 | `connectionState` 已暴露 |
| L10 | 权限 Full access 风险确认 | 🟢 | `permissions` projection 在；**写入经 `/permission` 命令需解封 commands.execute** |

---

## 6. 建议的下一步（可操作）

1. **先解封写路径**：把 `assemble.ts` 的 `noopRemote.commands.execute` 换成经 `createWebConnectionRpc()` 的真 `commands/execute` 桥（仿 `remote.ts` 的 `createCordisRunnerRemote`）——这一步同时解封 PermissionSelect 提交、Plan off、/goal、命令执行。
2. **给 `AppRuntime` 补一个官方 `useProjection` 绑定**：对 `runtime.wire.sessions.get(selectedId).projections.faceOf(key)` 用 `bindSnapshotSelector`，即可喂 ContextMeter/Todo/Goal/Plan/Permission/StatsLine——一行 uSES，六个组件。
3. **`/` `@` 触发管线**：桥 `commands/list` + 建 source 注册 + MenuView（anchor `conversation.input.overlay`），popupSelect 外壳随后。（这是「触发管线 UI 缺失」的最大手写面。）
4. **Matrix 化优先级**：从已 🟢 的「对话流 12 节点 + 工具树 + 附件 + AgentPreset + Cordis 卡」先套视觉，这些数据零缺口、只差渲染。
5. **Trajectory 明确降级**：当前阶段不追轨迹视图（需 vendor `ui-trajectory`）；在验收口径里把三维视图列为「官方未 vendor、需增包」单独跟踪。

---

## 附：zion 当前实际已渲染的 10 个 UI 组件 → 官方对应

| zion UI | 官方对应 | 备注 |
|---|---|---|
| `AppFrame.tsx` | AppFrame | 三栏 + 顶部 shell topbar（官方无此 topbar，属 zion 独有外壳） |
| `Sidebar.tsx` | SidebarRoot + WorkspaceBrowser(简化) | 平铺会话列表 + 本地搜索；无分组/Modal |
| `ConversationDock.tsx` | ConversationRoot（hero/skeleton） | 静态 hero |
| `ChatView.tsx` | ConversatizationRoot chat | **节点渲染为纯文本**（最大待 Matrix 化面） |
| `InputBar.tsx` | InputBar | textarea + `<select>` 模型 + 附件摄入 + 限额校验 |
| `InteractionDock.tsx` | ApprovalPanel + QuestionFlow | pending 卡（数据/响应已接） |
| `QueueDock.tsx` | QueueDock | remove/steer |
| `ToolCallCard.tsx` | ToolRow + GenericToolCard | 折叠行 + Matrix diff 卡 |
| `DetailsPanel.tsx` | DetailsPanel | 占位（官方未接线） |
| `PluginHost.tsx` | CordisPanel(调试版) | 存证用，非官方卡 |
