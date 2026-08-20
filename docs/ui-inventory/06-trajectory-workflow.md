# G6 轨迹/工作流/交付物盘点

> 盘点对象三个包（仓库根 `D:\github-Clone\deepseek-harness`）：
> - `packages/client/ui-trajectory` — 会话 «轨迹（Trajectory）» 视图标签页
> - `packages/client/ui-workflow-run` — 工作流运行的 chat 节点
> - `packages/client/ui-deliverables` — 消息尾部产物文件行 + 行内文件提及
>
> 目标：为重建 UI demo 提供一份不遗漏任何可见组件的精确清单。
> 数据源命名：**projection=会话 snapshot 的独立投影**（trajectory 视图来自 `ConversationSnapshot.views.trajectory`，由新增业务的 Context 组装），**历史=与会话历史分页同源**。
> 注意：`TrajectoryCell.tsx`、`TrajectoryTurn.tsx`、`TrajectoryTurnHeader.tsx`、`TrajectoryGroupHeader.tsx` 为**未接入渲染路径的旧组件**（无导入引用），见文末说明。

---

## 包：ui-trajectory

**注册机制**：`index.ts apply()` 向 `slots` 注入 `conversation.view`，`id: 'trajectory'`，`order: 10` → 会话视图切换标签页出现「轨迹」。同时注册 6 个业务的 Context 定义：
- `trajectory-message-definitions`（user/assistant/tool/context 等消息节点）
- `trajectory-request-header-definition`
- `trajectory-assistant-definition`
- `trajectory-tool-definition`
- `trajectory-compaction-definitions`
- `trajectory-snapshot-builder` 的 `trajectory` 目标（`registerTrajectoryConversationView`）

视图组件树：`TrajectoryView` → 顶层 `[TrajectoryToolbar 粘性工具栏] → [TrajectoryTimeline 概览时间轴] → [TrajectoryTable 台账 + 右侧详情检查器]`。

**数据源（关键）**：`TrajectoryView` 通过 `useSession(snapshot => snapshot.views.get('trajectory') ?? EMPTY_TRAJECTORY_SNAPSHOT)` 读取 **projection**（`TrajectorySnapshot`：`eventNodes`、`eventLocations`、`requests`、`callSchemas`、`partial`、`runningCalls`）。分页加载走 `loadOlder()`（会话历史 `session.loadOlder()`）。`setActualDuration` 写入 duration store（`SnapshotStore<boolean>`）。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `TrajectoryView.tsx` | 视图根容器 `data-conversation-composer-overlay`，组合 Toolbar+Timeline+Table；折叠态/搜索/时间轴选择/实际时长 全部本地 state | `snapshot.views.get('trajectory')`、`openState`、`loadingOlder`、`hasMore`、`inspect` | 经 `conversation.view` 注入 | 无 `export` 默认视图外的额外注册；`useSession` 绑定会话 |
| `TrajectoryToolbar.tsx` | **粘性工具栏** `role=toolbar`：①Duration 时长开关按钮（SVG 圆环时钟图标，`aria-pressed`，标题在 Use actual duration / Use equal-width 间切换）②Actual time 分隔开关 `role=switch`（**`hidden` 属性隐藏**，不渲染可见）③Turns 折叠按钮（⊞/⊟ 图标）④Calls 折叠按钮（⊞/⊟）⑤搜索框（`type=search`+放大镜图标 `IconSearchOutline16`） | 工具栏纯受控 props（无直接业务数据） | —（每次 `conversation.view` 重新渲染挂载） | Actual time 开关被 `hidden` 隐藏，仅保留 state；真正可见的是 Duration 开关 |
| `TrajectoryTimeline.tsx` | **Chrome-Network 式概览时间轴**：左侧固定行标签 `Input / Model / Tools`；中部投影时间线（三行 lane 泳道），每条记录一个 span 色块（按 kind 着色），Turn 边界竖线，assistant span 用 TTFT/解码分割；支持拖拽框选时间范围、滚轮缩放、右键拖动平移、双击/Esc 清空、点击空白聚焦最近记录、500ms Tooltip（记录总时长/起止/TTFT·Decoding）；顶部「…」加载更早历史按钮 + 「No timing data」空态 | `turns`（来自 projection 派生）`mode`/`range`/`selectedIndex`/`searchMatchIndexes` props；**纯本地组件** | — | `mode` 四态：sequence/duration/time/actual |
| `TrajectoryTable.tsx` | **台账表格** `<table>`：event 列（kind 标签+图标、Turn 标签、Request # 分隔控件、turnRail/selectionRail 装饰）+ content 列（内容文本 / `→` 内联结果预设）；折叠 summary 行（…+文本）；`tabIndex` 行可键盘（Enter/空格）选择；行内 Tooltip（kind 徽标）；虚拟化行渲染；顶部「Loading trajectory…」加载行；加载更早历史首行按钮 | `turns`、`requestNumbers`（由 `requests`+`nodes` 派生）、`searchMatchIndexes`、`timelineFocusIndexes` props；**本地组件** | — | 使用 `@tanstack/react-virtual` |
| TrajectoryTable 内部「右侧详情检查器」 `aside[aria-label="Event details"]` | 左侧 Event 列表+**右侧可拖拽/键盘调节的详情面板**：`role=separator` 分隔条（拖拽调宽/双击重置）；详情头部（kind 标签+位置文本+关闭 ×）；标签页 `role=tablist`（按记录类型不同：system→System Prompt/Tools/Diff；compacted→Summary/Raw Output；markdown→Summary/Preview/Raw/Source；工具→Summary/Payload/Result/Schema/Timing；request→Summary/Options/Usage/Timing）；Overview 摘要区块链（可跳转的 Hierarchy 导航：Request/Assistant Message/Tool Call/Result）；Usage 双栏（This request / Session cumulative）；Post JSON 树 / Markdown 渲染 / 原始 pre / diff；思考折叠「Thinking」；工具目录折叠清单（Tool Catalog）；Schema 展示；时间详情表（Started/TTFT/Generation/Throughput tok/s） | 选定记录与选定 request（本地 state），由记录 cell 字段渲染 | — | 有 `Summary/Timing` 等大段内部面板 |
| `TrajectoryTurn.tsx` / `TrajectoryTurnHeader.tsx` / `TrajectoryGroupHeader.tsx` / `TrajectoryCell.tsx` | 旧版「Turn 头 + Step 组头 + Cell 行」分块渲染（Message / Step N 头，Input/Output/Think/Time 标签，Cell kind 徽标） | 非 activity 路径 | **未接入** | 未被任何活动代码 import，仅在 `layout.ts`/`trajectory-record.ts` 里的类型对齐；**重建时可不实现** |
| `locales.ts` | `NS='trajectory'`：视图标签 `view.trajectory`（中「轨迹」/英「Trajectory」）+ 工具栏文案 | — | — | 标签随 locale 变动 |
| CSS modules | `TrajectoryToolbar/Dimeline/Table/GroupHeader/Cell/Turn/TurnHeader/views.module.css` | — | — | 全部布局/配色 |

**可视化入口**：会话视图顶部的标签页切换（由 `ui-conversation` 渲染该 `conversation.view` 槽），标签「轨迹/Trajectory」，`order:10`。

---

## 包：ui-workflow-run

**注册机制**：`index.ts apply()` ①`conversationEvents.register(workflowRunDefinition)` 注册 `kind:'workflow-run'` **chat 节点**（消费 `tool-workflow/run-start`、`agent-start`、`agent-end`、`run-end` 四事件，keyed by runId，`buildViewNode` 投影出 `WorkflowRunChatData`）②`slots` 注入 `conversation.chat.node`，`key:'workflow-run'` → 渲染 `WorkflowRunPanel`。`inject:['conversationEvents','slots','sessions','locale']`。

**数据源**：node 数据来自 `tool-workflow/*` 会话事件（**history**，随历史分页重放，非 projection）；`useSessions` 读普通 Session 列表以判断成员可导航性。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `WorkflowRunPanel.tsx`（主组件） | 一个工作流运行 `<section data-workflow-run data-run-status>`：**RunHeader 折叠行**（`DisclosureRow`，32px，`--dsw-alias-bg-module-platform` 行，持久右/下 chevron，行内 `StateDot` 状态圆点+状态文本，「N 个成员」；运行中/失败/取消/中断时强制展开 → 静态展开行无按钮）；下方 **phaseList**（空时显示空态文案「No members started/没有启动成员」）；每个 **PhaseSection**（32px DisclosureRow，标题=阶段名/「未分阶段」/「空阶段名」+成员数+右侧精确聚合状态摘要「已完成 N · 运行中 N …」）；每个 **MemberRow**（16px StateDot 圆点槽+截断名+固定 64px 状态列） | `node.data`（`name`/`status`/`phases[].phase/members[]`）；`useSessions` → 可导航成员 | `conversation.chat.node` key=`workflow-run` | 折叠状态按生命周期事实派生；成员可导航 = History 里在跑 + `origin:'subagent'` + `parentId===本会话` + 仍在运行 → **下划线按钮**，点击 `openSession(id)` 打开子会话；Keyboard focus 时名字区 2px 高亮环，状态文本保持「运行中」 |
| `workflow-definition.ts` | 非 UI：节点折叠逻辑（phase key 保留空与缺省不同、interrupted 推断、状态投影） | — | — | 定义 `workflowPhaseKey`、`projectWorkflow` |
| `locales.ts` | `NS='workflowRun'` 全量文案（run.title/members/empty、phase.unassigned/empty、statusCount.*、status.*、member.open） | — | — | 状态文案 5 种：running/completed/failed/cancelled/interrupted |
| CSS modules | `WorkflowRunPanel.module.css` | — | — | run/phase/member 三种行样式、StateDot 槽、状态色 |

**可视化要点**：工作流以 `workflow-run` 类型在对话流中作为独立 chat 节点卡片出现（由 `ui-conversation` 的 chat 渲染 slot 承接），不改动原 workflow 工具卡片。运行中的节点强制展开，全部完成后折叠一次。

---

## 包：ui-deliverables

**注册机制**：`index.ts apply()` ①`conversationEvents.register(deliverablesDefinition)`（`kind:'deliverables'`，随 `turn/start`、`tool/call`、`tool/result` 折叠到 `DeliverablesTurnData`，经 `buildLocationData` 发布到 turn-level `locationData['deliverables']`，无视图节点）②`slots` 注入 `conversation.chat.turnTail`（`select: selectProducedFiles`）→ 渲染 `ProducedFiles` ③`ctx.provide('chatFileMentions', ...)` 提供行内文件提及服务（chat 视图在每条 closing message 查询）。`inject:['slots','locale','conversationEvents','connection']`。Node 半区注册 `ui:deliverable-file-references` 系统提示段（引导模型提及所建文件并以行内代码写路径）。

**数据源**：产物路径来自 mutation 工具调用结果 `locations`（diff card 或 `kind:'edit'` 的 generic card），**不是 closing 散文**；按 Turn 去重、首个出现序；`producedForClosing(data, seq)` 取快照的页尾 seq 之前的产物；`selectProducedFiles` 在无产物时为 `null`（**拒绝挂载 → 空态由 chat 视图呈现为空链**）。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `ProducedFiles.tsx` | 一条产物文件行（位于 closing 消息正文与 IconActions footer 之间）：安静标签（`produced.label`）+ 一个单行文件通道。最多 6 个 chip（`SHOWN_LIMIT`），显示能放下的最大前导前缀（chip 文本=basename，`title`=全路径），超出显示本地化 `+ N more`（精确预留宽度）；每个 chip 点击经 `openFile(path)` 打文件；尺测量元素（隐藏 probe chips）决定自适应数量；当有隐藏且 `canOpenPath`（loopback 且 host `canOpenPath`）时第二行出现 **Show in folder** 按钮 `openFile('.')` 打开会话工作区 | `matched`（由 `select: selectProducedFiles` 预匹配的路径数组）、`openFile`、`isLoopback`、`useHostDescription` | `conversation.chat.turnTail` | **空态**：无产物时 `select` 返回 null，整个行不挂载（行/标签/chip 都不出现）；行内文件提及独立于本行由 `chatFileMentions` 服务驱动 |
| `turn-deliverables.ts` | 非 UI：`deliverablesDefinition` 折叠器、`producedPaths`、`producedForClosing`、`selectProducedFiles`、`producedFileMentions`（精确路径或唯一 basename 解析）、`basename` | — | — | 词汇来自工具结果 locations |
| `locales.ts` | `NS='deliverables'` 文案（label、open、more、moreOne、showInFolder） | — | — | — |
| CSS modules | `ProducedFiles.module.css` | — | — | label/row/chip/more/showFolder/measure/probe |

**可视化入口**：每条成功执行过写入的 turn 结束时，在 closing 消息底部、操作条之间插入一列文件 chip；行内代码提及（恰为一个产物的 basename 或全路径）变成蓝色行内链接，`title` 为全路径，永不渲染在锚点/流式文本内。

---

## 各包可见组件计数（重建清单核对）

- **ui-trajectory**：3 个活动可见顶层组件（Toolbar / Timeline / Table），其中 Table 自带右侧详情检查器（多子面板、标签页、Usage 双栏、Diff、Tool Catalog、时间表）——重建时详情面板是本包最重的一块。旧版 4 个组件（Cell/Turn/TurnHeader/GroupHeader）**未接入**，可跳过。
- **ui-workflow-run**：1 个活动组件（WorkflowRunPanel），内含 RunHeader/PhaseSection/MemberRow 三种 DisclosureRow 层级；空态成员文案、强制展开态、可导航成员下划线是易漏点。
- **ui-deliverables**：1 个活动组件（ProducedFiles）+ 行内提及服务；空态（无产物整行不出现）、`Show in folder`（仅 loopback+canOpenPath）是易漏点。

## 容易被遗漏的点（重建重点）

1. **轨迹标签页如何进入**：不是独立路由，而是会话视图顶部 `conversation.view` 槽的一个标签（id=`trajectory`，order=10，文案「轨迹/Trajectory」），与默认聊天视图平级；必须由视图切换 TabBar 渲染才能进入。
2. **轨迹数据是 projection 而非纯历史**：`snapshot.views.get('trajectory')` 由独立 Context 组装（request-header/assistant/tool/compaction/turn-end/session-end 等贡献），含 `partial`（流式）与 `runningCalls`；`requests` 派生会话级 Request # 与累计 token。重建 demo 需用 mock 的该 snapshot。
3. **详情检查器是轨迹视图的核心交互**：右侧面板、可拖拽/键盘调宽分隔条、按记录类型不同的标签页集合、Overview 里的 Hierarchy/Result 跳转、Usage 双栏、系统提示 Diff、Tool 目录折叠清单、Assistant 时间表（含 TTFT/Generation/Throughput tok/s）、思考折叠「Thinking」、图片面板（PanelImage 新窗口打开）、工具调用摘要按钮（Source Blocks）。
4. **工作流 agent 卡交互**：只在「子会话仍在运行且是 `origin:'subagent'` 且 `parentId` 为本会话」时成员才是下划线可点按钮（`openSession`），否则为静态行；键盘聚焦时名字区 2px ring；状态文本总是「运行中」不为按钮文案；运行中/失败/取消/中断强制展开（静态无按钮行）。
5. **工作流空态**：phaseList 为空时显示「No members started/没有启动成员」；未分阶段显示「未分阶段/Unphased」；空阶段名显示「空阶段名/Empty phase name」；空成员名「空成员名/Empty member name」。
6. **交付物尾部空态**：`selectProducedFiles` 在无产物返回 null → 整行不挂载（不是空容器），重建时在无产物时完全不带 tail 行；`Show in folder` 只在 loopback 且 `canOpenPath` 时渲染第二行。
7. **轨迹时间轴交互**：拖拽框选时间范围→台账聚焦；滚轮缩放；右键拖动平移；双击/Esc 清空；点击空白聚焦最近记录；点击记录块直选；早于页尾的「…」只认真实的记录开始，不伪造时长；「No timing data」空态。
8. **轨迹台账细节**：Request # 分隔控件（0/8px 递增 offset 区分并行请求 run）、Turn 标签（`Turn N` + 紧凑 `#N`）、kind 彩色徽标（SYSTEM/USER/CONTEXT/COMPACTED/ASSISTANT/TOOL/SUBTOOL）、`→` 内联结果、折叠 summary（steps·tool calls 摘要）、虚拟化、顶部 Loading 行、加载更早历史首行。
