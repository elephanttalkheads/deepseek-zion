# G3 对话核心盘点

包：`packages/client/ui-conversation`（对话域：骨架/头部/tabs/空态、聊天视图、composer 坞、输入坞、详情面板、ApprovalPanel 审批、TodoPanel 计划条、QueueDock 排队、ContextMeter 上下文环、PermissionSelect 权限选择、EnterBehaviorRow 设置项）。

关键机制：
- 对话流是**注册式业务节点**（不是内置闭合 union）。每个 node kind 由 `conversation-nodes/` 下的一个 `ConversationNodeDefinition` 构建数据（`ChatNodeDataMap[Kind]`），再由 `chat/register-node-renderers.ts` 绑定到 keyed slot `conversation.chat.node` 的一个渲染组件。`ChatNodeSeat` 按 `node.kind` 作为 `entryKey` 分发。
- 可见组件通过 slot 注册，不在包出口导出。核心渲染组件在 `src/client/`（chat/、skeleton/、input/、queue/、settings/）。
- tools（tool-call node）的呈现**委托给 ui-tool 包**（`conversation.chat.node` key `tool-call`），本包不直接渲染 tool 卡；详情面板的 tool 输出走 `conversation.details.tool`。

## 对话节点（ChatNodeKind → 渲染器）

| kind | 渲染组件 | 渲染内容 | 数据源 | 所属文件 |
|---|---|---|---|---|
| `user` | `UserMessageNodeView` | 右侧用户气泡（text + image gallery + `MessageIconActions` copy/clock，无 branch）；标注 `/name` `@name` 引用 chip；`user/message` append 事件 | `ChatNodeDataMap['user']` = `UserMessageNode`（conversation-nodes/message.ts） | chat/MessageItem.tsx |
| `steering` | `UserMessageNodeView` | 用户样式气泡，标识为被采纳进运行回合的 steering（claimed inbox），copy/clock，无 branch | `ChatNodeDataMap['steering']` = `SteeringMessageNode`（message.ts，claimed 判定） | chat/MessageItem.tsx |
| `context` | `ContextMessageNodeView` | 折叠的上下文注入 DisclosureRow（`上下文注入`/`跨会话召回` + producer 名），按 form 渲染展开体 | `ChatNodeDataMap['context']` = `ContextMessageNode`（message.ts）→ ContextInjectionRow → ContextBody | chat/MessageItem.tsx |
| `assistant-step` | `AssistantNodeView` | 流式/已定稿/中断的 Assistant（markdown 正文、reasoning Think 折叠行、image gallery、unknown JSON fallback；streaming/interrupted 标记） | `ChatNodeDataMap['assistant-step']` = `AssistantChatData`（assistant.ts）→ AssistantMarkdown | chat/AssistantNodeView.tsx |
| `command` | `CommandNodeView` | 普通 slash 命令行，按命令名 dispatch keyed slot `conversation.chat.commandview`，fallback = `GenericCommandCard` | `ChatNodeDataMap['command']` = `CommandNode`（command.ts） | chat/CommandNodeView.tsx |
| `manual-compaction` | `ManualCompactionNodeView` | 手动 `/compact` 命令 + 其关联 compaction 事务（折叠成 CompactionItem） | `ChatNodeDataMap['manual-compaction']` = `ManualCompactionChatData`（command.ts） | chat/CommandNodeView.tsx |
| `compaction` | `CompactionNodeView` | 自动压缩 checkpoint 标记（折叠，悬停展开 summary；模型面 payload 不渲染） | `ChatNodeDataMap['compaction']` = `CompactionSummaryNode`（compaction.ts） | chat/MessageItem.tsx（→ CompactionItem） |
| `model-retry` | `RetryNodeView` | 合并的重试链状态行（倒计时、条纹、最大次数/∞、可展开显示 delay + failure；scheduled/started/cancelled） | `ChatNodeDataMap['model-retry']` = `RetryChatData`（retry.ts） | chat/MessageItem.tsx（→ ModelRetryItem） |
| `turn-error` | `TurnErrorNodeView` | 终端 turn 失败内联状态行（StateDot + message + 可选 code；AUTH 不显示凭据片段） | `ChatNodeDataMap['turn-error']` = `TurnErrorNode`（turn-error.ts） | chat/MessageItem.tsx（→ TurnErrorItem） |
| `turn-max-tokens` | `TurnMaxTokensNodeView` | "达到输出 token 上限"结束提示行（warning StateDot + hint） | `ChatNodeDataMap['turn-max-tokens']` = `TurnMaxTokensNode`（turn-max-tokens.ts） | chat/MessageItem.tsx（→ TurnMaxTokensItem） |
| `turn-tail` | `TurnTailNodeView` | turn 收尾行：`conversation.chat.turnTail` 链 + `MessageIconActions`（copy/clock-end/`Ran for`/TTFT/tok/s/branch）；下挂 `conversation.chat.assistant-actions` 列表 | `ChatNodeDataMap['turn-tail']` = `TurnTailChatData`（turn-tail.ts，含 closing/seq/ttftMs/tokensPerSecond） | chat/TurnTailNodeView.tsx |
| `unknown` | `UnknownNodeView` | 未认领 append-surface 事件的 JSON 兜底 | `ChatNodeDataMap['unknown']` = `UnknownSurfaceNode`（fallback.ts，registerFallback） | chat/MessageItem.tsx |
| `tool-call` | **委托 ui-tool**（本包只留孔位） | chat view 分发的 `conversation.chat.node` key `tool-call` 由 ui-tool 注册渲染器（递归 root/子调用树）；本包 `ChatNodeSeat` 的 fallback = JsonBlock | `ChatNodeDataMap['tool-call']` = `ToolChatData`（conversation-nodes/tool.ts，root `ToolCallBlock`） | chat/register-node-renderers.ts（注，本包不注册此 key） |

**加载窗口内的可见组件（非 keyed 渲染器的组成件）：**

| 组件 | 渲染内容 | 数据源 | 所属文件 |
|---|---|---|---|
| `MessageIconActions` | copy（check 反馈）、branch（可禁用）、date-aware clock（`· Ran for`、`· TTFT`、`· tok/s`）；可接 `extraActions` | 传入 text/time/runMs/ttftMs/tps | chat/MessageIconActions.tsx |
| `ReasoningRow` | Assistant reasoning 的 "Think" 折叠行（流式尾时滚动最近行摘要；展开后完整思考） | block.text + running 标志 | chat/ReasoningRow.tsx |
| `CompactionItem` | 压缩标记按钮（context 图标 + disclosure chevron + title + summary），展开 `MarkdownText` summary | `CompactionSummaryNode`（+ 可选 title/fallbackSummary） | chat/CompactionItem.tsx |
| `CompactionCommandCard` | `/compact` 运行行与成功 checkpoint（有 checkpoint → CompactionItem；否则 GenericCommandCard） | CommandNode + compaction? | chat/CompactionCommandCard.tsx |
| `GenericCommandCard` | 默认命令行（DisclosureRow：名称 · 结果摘要；展开 body） | CommandNode.outcome | chat/GenericCommandCard.tsx |
| `ContextInjectionRow` | 折叠上下文行（icon、角色标题、source 名、notice summary；展开 body 由 form 决定） | content/source/provenance/form | chat/ContextInjectionRow.tsx |
| `ContextBody`（+InstructionsBody/CatalogBody/SnapshotBody/NoticeBody/RelayBody/RecallBody/OpaqueBody） | 按 `form` 的展开体：instructions 文件表、catalog 条目表、snapshot sections、notice、relay sender、recall counts、opaque 兜底 | `contextBody()` 解析 source | chat/ContextBody.tsx |
| `StatsLine` | 统计条（turns/steps、LLM/tool 时长、TTFT 均/tok/s、cache-hit%、in/out tokens），裁剪 ellipsis + 悬停 tooltip | `sessionStats`/`tokenUsage` projection（fallback `deriveStats` 折叠窗口） | chat/StatsLine.tsx |
| `TurnStatus` | 运行中 turn 的 "Deep diving..." + 运行超 15s 的时钟 | timeline 开 turn start time | chat/ChatView.tsx（内部） |
| `PendingSteeringBubble` | 未入 transcript 的 steering 用户样式气泡（copy only，`data-pending-steering`） | `queue` placement=='steering' | chat/MessageItem.tsx / ChatView.tsx |
| `ChatView` | 对话视图入口：stable Node 列表 + 分页(loadOlder) + 底部跟随 + 加载/错误提示 + `data-chat-flow` | `useSession` chat.order/nodes/timeline、queue | chat/ChatView.tsx |
| `ChatNodeSeat` | 每个 node 的 keyed seat（订阅单 node、dispatch `conversation.chat.node`，fallback JsonBlock） | `useSession` chat.nodes.get(nodeKey) | chat/ChatNodeSeat.tsx |

## 输入/队列

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `ConversationRoot` | 驻留骨架：hero（HeroGlow/HeroShell/WorkspaceChip/agentPreset）→ composer 链 → 严格 session header/body 时序；hero/composer 相位判定；`data-conversation-scroll` scrollport + sticky composer seat（`data-composer-seat`） | useSession openState/composerPhase/pending、useSessions、useWorkspaces、composerBlock | `conversation`（根） | 常驻，跨无会话/会话转换 |
| `InputBar` | **默认 composer 主体**（'conversation.composer.bar'）：textarea（背板 chip/装饰/hint 镜像层）、AttachmentRail（草稿图）、DropOverlay（整页拖放）、Toast（提示错误）、notice、PermissionSelect、左侧 plus(命令启动器)、`conversation.input.plan`、`conversation.input.model`、ContextMeter、Send/Stop、`conversation.composer.dock`(stats/other)、input.left/right | useInput/inputActions、useNotices/useLexicon、useProjection(plan/goal/imageLimits/permissions)、session running/promptError/subagent | `conversation.composer.bar`（session-maybe） | 惰态（无会话）→ 只读 textarea 作为 Workspace 触发器；block 态保留 model seat |
| `PermissionSelect` | 权限选择 chip（shield glyph、Menu 下拉、kebab→Title Case；`danger-full-access`→`Full access` + RiskConfirmation modal） | `permissions` projection + `command` 回调（提交 `/permission <preset>`） | 由 InputBar 内联（非独立 slot） | |
| `ContextMeter` | composer 尾部 14px 上下文占用环 + 点击打开 breakdown 面板（system/tools/messages 分段条 + ~token 数） | `contextPressure` + `contextBreakdown` projection | 由 InputBar 内联 | 两者都已知才渲染 |
| `ApprovalPanel` | **审批接管面板**：琥珀 "Waiting for approval" 条 + 理由标题 + 配对命令(muted code) + 一次性 refuse/allow；`conversation.composer` 链 selector（priority 1） | `PendingApproval` 域面（PendingWait<'approval'> 载体）+ rootToolCall 查命令 | `conversation.composer`（chain，selector-routed） | 在 composer 中替换 InputBar |
| `TodoPanel`/`TodoDock` | 计划条（'conversation.input.dock' order 0）：标题 + state counts + 折叠列表（completed/in_progress/pending 状态 glyph） | `todos` projection（standalone plan） | `conversation.input.dock` | 空列表隐藏；默认折叠 |
| `QueueDock` | 排队坞（order 20）：单条直接显示；多条折叠 `<n> 条排队消息`；每行 edit/delete/steer（子 agent 只读）；edit 模式 save/cancel | `useSession` queue（placement=='queued'）+ `conversation.updateQueue` | `conversation.input.dock` | 180px 高度上限滚动 |
| `EnterBehaviorRow` | 通用设置项：busy 态 Enter 行为选择（Queue/Steer） | `settingsScope` 持久化（`$DSH_HOME/settings.yaml`） | `settings.general.item`（order 20） | |
| `ConversationSession` | 严格 session body：active view ring（`conversation.view` only: active）、draft mirror、image release | chat store + view ledger + bindDraftMirror | `conversation.session` | 空白会话返回 null |
| `ConversationSessionHeader` | 严格 session header：crumb 面包屑 + `header.actions` + `header.utilities` + view tabs | chat store view、ancestry、views.list | `conversation.session.header` | 空白会话隐藏 |

## 骨架与其它

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `EmptyHero`（HeroShell/HeroGlow/WorkspaceChip/workspaceLabel） | 空态 hero：鱼 logo 头条 + "Preview" 徽章 + glow 椭圆背板 + workspace chip | useWorkspaces/cwd/workspaceTitle | 由 ConversationRoot 内联 | workspace chip 触发 `conversation.hero.workspace` 选择器 |
| `DetailsPanel` | 工具调用详情面板（标题 + 关闭 + Input JSON CodeBlock + Output 走 `conversation.details.tool`，raw-result 兜底） | chat store selection + `materialFor` session 快照 | `details`（含 `conversation.details.tool` 子孔） | **无入口**：`openDetails` 已实现但未调用 |
| `service.ts`（ConversationController/IConversation） | 非 UI：会话作用域 send/cancel、createDraftImages/draftImages/release、resolveImage、updateQueue；输入 hub = registry | — | 服务 `ctx.conversation` | |
| `stores.ts`（createChatStore） | chat store：selection/draft/view/inspect（持久化 `dsh.conversation.chat`） | — | 共享 store 注入 | |
| `input/`（machine/hub/facade/blocks/decorations/submission-policy） | 非可见：输入状态机、chip 拓扑、装饰、块、提交策略（纯逻辑） | — | — | InputBar 消费 |
| `locales.ts` | `conversation` locale namespace（zh/en） | — | — | |

**Slot 全表（本包声明/注册）：**
- 根（`conversation`）：`conversation.session`、`conversation.session.header`、`conversation.composer`(chain)、`conversation.composer.bar`(session-maybe)、`conversation.input.overlay`、`conversation.input.dock`、`conversation.composer.dock`、`conversation.input.left`、`conversation.input.right`、`conversation.hero.workspace`(root)、`conversation.hero.agentPreset`(root)
- 严格 session body（`conversation.session`）：`conversation.view`（list）
- 严格 session header：`conversation.session.header.actions`、`conversation.session.header.utilities`
- composer bar：`conversation.input.plan`、`conversation.input.model`
- 会话 header/body/view 共享 chat store
- Chat view：`conversation.chat.node`（keyed，CHAT_NODE_INJECT）、`conversation.chat.commandview`（keyed by command name）、`conversation.chat.turnTail`（chain）、`conversation.chat.assistant-actions`（list）
- `conversation.composer.dock`：StatsLine（order 0）
- `conversation.input.dock`：TodoDock（order 0）、QueueDock（order 20）
- `conversation.composer`（chain）：ApprovalPanel（selector priority 1）
- `details`：`conversation.details.tool`（single）
- `settings.general.item`：EnterBehaviorRow（order 20）
