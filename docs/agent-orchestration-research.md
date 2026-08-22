# Agent 工作流编排研究报告

> 主题:Agent 工作流编排(Agent Workflow Orchestration)的机制研究——以 DeepSeek Harness(DSH)会话运行时及其复刻工程 deepseek-zion 的官方客户端源码为参考实现,逐项剖析**队列、审批、工具调用、投影**四类核心编排机制,并与业界模式(LangGraph / Temporal / HITL Approval Queue / 事件溯源)对照。
> 本报告所有仓库侧论断均可回溯到所列源码文件;机制名称、RPC/事件/槽位名以 `CONTEXT.md` 词表与官方 client 源码为准。

---

## 第一章 引言:Agent 工作流编排的问题域与总体架构

"Agent 工作流编排"指的是:把一次"模型生成 → 工具执行 → 结果回注模型"的朴素循环,组织成**可治理、可干预、可观察、可恢复**的运行结构。第一代框架只解决"把模型放进带工具的循环",真正困难的是运营这个循环本身:工具边界如何划定、状态如何跨重启存活、哪些动作必须经人确认、执行历史如何审计回放。业界对此形成了两条路线:一是**图式编排**,把 agent 显式建模为节点/边/共享状态/检查点(LangGraph 的 nodes、edges、checkpoints、`interrupt()` 暂停与外部输入恢复;Temporal 则把 agent 作为长流程中的一个有界阶段,由 workflow 运行时持有 continuation、durable waits、重试与恢复);二是**事件式编排**,以追加式事件日志为唯一事实源,当前状态是日志的确定性投影(如 ESAA 的 event store + read models)。DSH 属于后者,且给出了一个罕见的"客户端可完整复现编排状态机"的实现样本。

DSH 的总体结构是 host/client 双进程:host 侧是 agent 运行时(模型循环、工具执行、权限服务、工作流运行),client 侧是 Web UI。两者之间没有自定义协议层——客户端通过 52 个 RPC + `respond` 应答面发起操作,通过**双 WebSocket**(`events.mux` 复用事件流 / `events.host` 主机事件帧)被动接收状态;会话(session)是后端持久化的对话上下文,侧栏列表、切换、新建、删除、归档全部消费官方运行时真实数据。deepseek-zion 复刻工程的数据层采用"B 直拼":直接 `new` 官方纯 TS 类(WebApiClient/FixtureApiClient → ConnectionController → SessionManager → Session),用 `bindSnapshotSelector` 把 `{getSnapshot, subscribe}` 绑成 hooks 透给组件——这等于把官方编排状态机完整地搬进了客户端,为机制研究提供了逐行可读的参考实现。

编排的回合(turn)模型是这一切的骨架:一次用户投递或一次续跑构成一个 turn,回合内由 `turn/start`、`step`(每个 step 可含文本 chunk 与工具调用)、`turn/end` 等事件按 **seq 全序**组织;客户端会话装配器(conversation-assembler)按 seq 合并上下文,产出 12+1 种对话节点 kind(user/steering/context/assistant-step/command/manual-compaction/compaction/model-retry/turn-error/turn-max-tokens/turn-tail/unknown,外加委托工具卡的 tool-call)。在这个骨架上,编排的真正控制点集中在四条机制上,正是本报告的主题:**队列**(输入端序列化与人类干预)、**审批**(高危动作的授权闸门)、**工具调用**(执行面与反馈闭环)、**投影**(跨边界的状态一致性读模型)。它们共同串起官方定义的"进会话→流式→工具→审批→结算"对话核心闭环主轴,也在 R3(事件订阅完整,别丢 `session/queue` 等帧)与 R4(不伪造遥测,只展示官方运行时给出的真实事件/投影/结果)两条红线中留下明确痕迹。

---

## 第二章 队列机制:输入序列化与人类干预通道

在单执行者、回合原子的会话模型里,"人类在回合进行中继续输入"是一个必须显式解决的编排问题:LLM 回合不能被打断重排,否则执行者上下文会失序。DSH 的答案是**队列模式**——`sendPrompt` 实际调用 `session.prompt(parts, 'queue')`(`renderer/src/app/runtime.tsx`),把新输入投进选中会话的 transient inbox,即会话快照里的 `snapshot.queue`;宿主在回合期间与跨回合期间把投放位置(pending placements)持续推给客户端。这正是 R3 红线点名"别丢 `session/queue`"的原因:队列事件流是客户端 UI 状态的关键输入,订阅缺失会让排队内容从界面上消失。

队列项的语义由**投放位置(placement)**区分,`QueueDock.tsx` 中三态映射为:queued(待发送)、steering(插队)、context(上下文)。三者不是装饰性标签,而是三种不同的编排意图:queued 是普通排队,按序等待下个回合;steering 是人类**插队干预**——把一条指令提升到当前回合的优先位置,立即影响在飞执行(客户端另有 `steering-history.ts` 维护插队历史,支撑轨迹视图);context 则是把内容作为上下文注入而非作为待执行指令。这套"待决位置"模型与普通消息队列(削峰解耦、消费即删)有本质区别:编排队列里的每一项都**可编辑、可撤销、可改语义**,是会话时间轴上的可干预点,而不是不可变的待处理任务。

干预动作全部经 `updateQueue(itemId, action)` 走 wire(`runtime.tsx` 直接转发到 `session.updateQueue`),动作分三种:remove(移除排队)、steer(提升为插队)、edit(行内编辑)。其中 edit 的实现细节很有代表性——`QueueDock.tsx` 的 `commitEdit` 以**完整的 prompt content 块数组** `[{ type: 'text', text }]` 整体替换原排队内容,与官方 `updateQueue` 的 edit 语义一致:编辑发生在发送之前,因此既不产生对话历史节点,也不伪造任何事件(R4)。UI 侧,`QueueDock` 渲染选中会话的 `snapshot.queue`(无队列且无错误时自返 null),并在行内提供"编辑/插队/移除"三按钮;`InputBar` 在回合运行中也允许发送,提示进入队列模式(queue),与"停止"按钮并存——官方 composer 的同姿态。

从编排视角看,队列机制回答的是"输入何时、以什么身份进入执行者视野":运行中投递不丢、不重排、不打断,而是进入待决区等待结算;人类可以在队列里改写、提升、撤回自己的指令。它与审批机制形成分工——队列是**非阻塞投递**,审批才是**阻塞闸门**(第三章);与 LangGraph 的 `interrupt()`(图内暂停等待外部输入)相比,队列不暂停执行,而是把人类输入安放到时间轴的正确位置。

---

## 第三章 审批机制:人在回路的高危操作闸门

审批是"待执行动作"与"实际执行"之间的强制闸门:没有人类确认,高危操作(插件运行、Full access 权限动作等)不得落地。DSH 的审批是一个**双向帧协议**:宿主发出 `approval/requested` 帧,客户端会话装配出 `PendingWait`(approval 类别)进入挂起交互列表 pending;用户应答后,面板走 `PendingWait.respond → api.respond`(client-response 帧)回传宿主;宿主以 resolved 帧驱动离场,会话 pending 清空后 UI 自动回归默认姿态。`renderer/src/app/composer-takeover.tsx` 完整实现了这套语义:它按官方 composer 槽链的选举语义直编了 **ComposerSeat**,优先序为 approval(priority 1)> question(默认 0)> 只读子代理(-10)> 默认 InputBar——即挂起的审批请求**接管 composer 座位**,以官方 vendored `ApprovalPanel`(ui-conversation skeleton)渲染"等待审批卡",而聊天流不重复渲染该交互(官方语义:挂起交互接管 composer,而非旁路弹窗)。这个"审批卡坐进输入框"的设计是 DSH 编排的显著特色:审批不是飘在页面角落的对话框,而是会话流程中的一个座位,决策上下文与对话上下文保持连续。

插件/命令审批链是第二个实现面:`renderer/src/plugin/run-orchestrator.ts` 消费 `cordis/request-run` 与 `request-run-resolved` 事件,维护插件维度的 activity 两阶段状态机:**awaiting-approval → orchestrating**;`requiresApproval` 标记决定请求是否进审批,`approve(requestId, approveFutureVersions)` 通过后驱动 `runHostHalf`(经 hub → remote 的 wire rpc 通道),`decline` 则终止请求。`PluginHost.tsx` 的审批卡把决策面做成三按钮:拒绝 / 允许 / **批准并信任**(approveFutureVersions=true)——后者一次性批准本次运行并信任该插件的未来版本,是"信任升级"的显式表达,与"渐进式委托"模式一致。权限侧还有预设体系:settings 的 permission 命名空间(schemastery envelope,`Full access` 风险确认经 ui-primitives 的 RiskConfirmation Modal、`workspace-write` 等预设)、composer 权限 chip、以及输入框 `/permission` 触发的 popupSelect 装饰(键入 `/` 走命令触发菜单管线)。

把审批放回编排全景:审批是队列与执行之间的闸门,`approve` 之后才 `runHostHalf`,`decline` 相当于"移除"该动作,`approveFutureVersions` 则把单次授权升级为类别信任;而 `ask_user_question`(第四章)管的是"执行什么",审批管的是"能否执行",两者互补。业界对照上,DSH 的实现与 HITL Approval Queue 模式(持久化请求 + payload 锁定 + 审计轨迹)方向一致,但 DSH 把"审查上下文"直接嵌入会话流——审批卡显示的是与对话同构的信息(配对命令、运行模式、目的说明),而"批准并信任"则对应授权策略的持久化升级,与 LangGraph 的 `interrupt_before` 高险节点暂停相比,DSH 更强调"审批即会话交互",而非"审批即图暂停"。

---

## 第四章 工具调用机制:动作执行与反馈闭环

工具调用是编排的执行面。回合内,工具事件与文本 chunk 一样按 seq 全序落在会话事件流里:turn/step/chunk/工具事件由 `conversation-location-index` 建立 seq→(turn, step) 坐标,`tool-call-tree.ts` 再把工具事件构造成**调用树**(父子嵌套、状态流转),`runningCalls` 反映在飞调用。UI 侧,`ChatView.tsx` 在渲染 tool-call 节点时挂 `SlotAnchor`(slot=`tool.call.toolview`,ownerProps={tool, key}),把渲染分派给**键控工具视图**:官方 `tool.call.toolview` 槽位按工具名分 key,共 10 个——bash / read / edit / write / grep / glob / web_search / web_fetch / todo_write / ask_user_question,每个 key 一种工具卡渲染(`CONTEXT.md` 词表);通用工具块由 M3 自研的 `ToolCallCard` 呈现(运行状态、参数、结果),skill 走专用行(ui-skill,settled 名取自 `block.call.name`)。这套"keyed slot 分派"本质上是**按工具类型注册渲染器**的插件点:复刻 UI 独占主体渲染,但新工具 key 可经附加型槽注入,社区插件的工具视图无需改核心代码。

工具调用的反馈闭环不止于卡片:一是**产物(deliverables)**——`ui-deliverables` 从 edit/write 工具的 locations 派生"产物行",chip 点击经 `host.openPath` 打开真实文件,把工具副作用变成可点选、可追溯的界面对象;二是**工作流运行面板**——`ui-workflow-run` 渲染 run 头、阶段展开、成员状态,展示"一个工具/一次 run 背后是一段多阶段编排"的视图。工具面还有硬约束:真后端核验记录过 400 归因 `tool_count_limit`——上游网关因工具 schema 数超限拒绝请求,说明工具面存在 schema 数量天花板,编排设计必须考虑工具收敛(如元工具/能力注册表模式),否则工具集增长会撞墙。

最值得注意的是 `ask_user_question`:它是 10 个工具 key 之一,即**人机交互以工具调用形式进入执行循环**。当模型在回合中需要人类澄清时,它"调用"这个工具,宿主产出 `question/requested` 帧,客户端 ComposerSeat 选举出 `QuestionComposer`(ui-user-questions)接管输入框;回答经 respond 帧回注,回合继续;携带 plan-review 意图的问题还会路由到 `PlanReviewPanel` 决策卡(决策 + 拒绝回执 + 结算离场)。这使"暂停回合向人类提问"成为执行循环的一等公民,与审批形成完整的人机分工:审批拦"能不能做",提问决定"做什么"。工具结果同时以事件流(会话 feed 节点)与投影(如 todos、deliverables,第五章)双通道反馈客户端——R4 红线要求 UI 只消费真实运行时给出的数据,不做客户端拼装。

---

## 第五章 投影机制:跨边界状态一致性读模型

投影(projection)是 DSH 编排的一致性层,设计原则一句话:**host 是唯一计算点,客户端不做任何领域折叠**。`renderer/vendor/client-runtime/client/sessions/projection-store.ts` 给出了完整实现:每个会话一个 `ProjectionValueStore`,按 key 持有"已完成整值"——`key → { value, seq }`;历史尾页的 projections block 负责播种,`session/projection` 推送帧负责增量更新,全部收敛到**单一合并规则:higher seq wins**。`apply()` 里 `seq <= row.seq` 的帧直接丢弃——重放帧不能回退值、过期基线不能覆盖新帧,乱序/重放问题被简化成一次序号比较;`seed(baseline)` 以 `asOfSeq`(构造上等于窗口尾 seq)为一致切点,携带的键按同一规则落地,遗漏的键视为"能力缺失"并清除(除非已被更新帧超越);`truncate(lastSeq)` 在 mux 代基线(`session/subscribed.lastSeq`)处丢弃超过宿主 durable baseline 的行,防止重启前"骑在丢失状态上"的行永久压过宿主重算值。这是 last-writer-wins 的序标版本,配合"host 重算 → 重播种"形成单调收敛。

消费侧是"第五框架席位":`useProjection` 是 key 寻址的投影读取器,per-key uSES 绑定到选中会话的 `ProjectionValueStore.faceOf(key)`(`runtime.tsx`),`undefined` 统一表示能力缺失(宿主单元未装配或尚无值),`bindSnapshotSelector` 把 `{getSnapshot, subscribe}` 绑成 hooks。实际键位覆盖了编排的各状态面:title(rename 响应 `{title, seq}` 直接落地为投影)、todos(待办)、contextPressure(上下文压力计量)、goal(目标)、plan(计划模式)、permissions(权限预设)、subagentTiming(子代理时序)——`ContextMeter`/`StatsLine`/`TodoDock`/`PermissionSelect`/`PlanChip` 等组件全部经它读投影。推送路径上,`manager.ts` 的 `handleMuxEnvelope` 收到 mux 帧后 `projectionStore(sessionId).apply(frame.key, frame.value, frame.seq)`,与 `session.export` 携带的投影块、历史尾页播种三路合一。

把投影放回编排全景,它解决的是"**多路事件源下的 UI 一致性**":对话事件流、队列帧、审批帧、工具事件、作业帧各自独立到达,若 UI 直接拼状态,重放、断线重连、乱序帧都会造成回退或撕裂;投影层把每个状态面收敛为"带序标的整值",UI 只需读投影、按 seq 裁决,天然单调收敛——这正是 CQRS 读模型(事件溯源 + 投影)在 agent 编排上的应用,与 ESAA"read models 是确定性投影、不是手改的真值"同构。对复刻工程而言,投影机制还承载着 R4 红线:UI 只展示官方运行时给出的真实投影,不伪造遥测、不客户端拼状态——投影既是一致性机制,也是"只读真相"的契约边界。

---

## 参考来源

**仓库内(参考实现,逐机制可回溯)**
- `CONTEXT.md`(词表:队列投放、tool.call.toolview 10 key、12+1 节点 kind、投影 higher seq wins、R3/R4 红线)
- `HANDOFF.md`(双 WS、52 RPC、composer 接管、批准并信任、deliverables、真后端核验)
- `renderer/src/ui/QueueDock.tsx`、`renderer/src/ui/InputBar.tsx`(队列渲染与运行中排队)
- `renderer/src/app/runtime.tsx`(sendPrompt queue 模式、updateQueue、useProjection 第五席位)
- `renderer/src/app/composer-takeover.tsx`(ComposerSeat 选举、ApprovalPanel/QuestionComposer 接管)
- `renderer/src/plugin/run-orchestrator.ts`、`renderer/src/plugin/hub.tsx`、`renderer/src/ui/PluginHost.tsx`(审批两阶段、批准并信任)
- `renderer/src/ui/ChatView.tsx`、`renderer/src/ui/ToolCallCard.tsx`(tool-call 节点渲染、tool.call.toolview 槽位)
- `renderer/vendor/client-runtime/client/sessions/projection-store.ts`、`manager.ts`、`session.ts`、`conversation-assembler.ts`、`tool-call-tree.ts`、`steering-history.ts`(投影存储、mux 帧、装配器、调用树)

**外部参照**
- [Designing a Human-in-the-Loop Agent Workflow(Feng's Notes)](https://ofeng.org/posts/designing-hitl-agent-workflow/)(Temporal/LangGraph/Trigger.dev 的 HITL 分工:workflow 持 continuation,应用持审批)
- [Human-in-the-Loop Approval Flow Pattern(Agent Native)](https://www.agentnative.dev/patterns/human-in-the-loop-approval-flow-pattern)(策略路由、审批队列、payload 锁定、审计)
- [Approval Queue — Agent Patterns Catalog](https://www.agentpatternscatalog.org/patterns/approval-queue/)(异步审批队列、渐进式委托、per-tool 审批对照)
- [ESAA-Core(Event Sourcing for Autonomous Agents)](https://github.com/elzobrito/ESAA-Core)(事件溯源 + 确定性投影、状态机闸门、不可变完成)
- [The Agent Harness(Go Micro)](https://go-micro.dev/docs/guides/agent-harness.html)(harness 问题域:护栏、检查点、可观测性、审批工具)
