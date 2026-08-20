# UI 完整盘点 07：Goal / Jobs / Message Feedback / User Questions

范围：`@deepseek-ai/dsh-client-ui-goal`、`ui-jobs`、`ui-message-feedback`、`ui-user-questions` 四个 client 包的可见 UI 组件盘点，供重建 UI demo 用。
源码根：`D:\github-Clone\deepseek-harness\packages\client\<pkg>\src\client\`（圆括号 = 真实注册名/slot）。

---

## 1. ui-goal（Goal 面板）

目标：Goal 完成条 + 命令输入气泡。`GoalBar` 是 `conversation.input.dock` 槽里第 2 张独立卡片（order 10，Todo 之后、Queue 之前）。实时目标经 `useProjection('goal')`（projection 模式的整体快照）进入，组件本身无数据 store、无事件监听。注入面只携带 4 个变异动词（edit/pause/resume/clear），经 `ctx.remote.goals` 调用，调用时读取 session 当前投影的 CAS ref，失败内联展示。**目标的创建不在 UI 里，而是 `/goal` 主机命令**。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `GoalBar.tsx` → `GoalDock` (注册组件) | 目标条：目标图标、阶段标签、截断目标文本、图标动作（active 显示暂停；paused 显示恢复；永远有编辑+清除）。编辑态转为条内内联表单（文本输入 + 保存/取消）。错误内联红字 role=alert | `useProjection('goal')` 整体快照 `goal.goal` + 注入口令 | `conversation.input.dock`，id=`goal`，order=10 | 边缘：`goal===undefined`(加载/能力缺失)、`null`(无目标)、`phase==='complete'`、或已清除的 id 时 **整条不渲染**。blocked 时 title tooltip 显示 blockedReason；完成的命令不在这里做。工具提示 Tooltip delayMs=500 |
| `GoalBar.tsx` → `GoalDock` 槽适配器 | 只读投影并转发 props | `useProjection('goal')`（无/store 无刷新） | 同一 dock entry | 注入协议在 `slots.ts` `GoalBarActions`（onEdit/onPause/onResume/onClear） |
| `GoalCommandInputView.tsx` | 每条 `/goal` 命令`command/run` 的人输入气泡——右对齐、14px/22px 等宽用户风格样式、无时间戳/复制/分支动作，aria 组标签「命令输入」 | `node.data`（`goalCommandInputData`：commandId/text/time） | `conversation.chat.node`，key=`command-input` | 节点经专属 Conversation Definition `goalCommandInputDefinition`（`goal-command-input.ts`）投影；文本 = `/goal` + trimEnd 参数。只渲染 human command 输入，结果行仍用通用命令 Definition |
| `locales.ts` | 文案字典（`goal` 命名空间，zh/en 双语） | 静态 | 注入 `ctx.locale` | phase.active/paused/blocked 标签、action.* 等 |

**槽注册**（`index.ts` 的 `apply`）：
- `conversation.chat.node` key=`command-input` → `GoalCommandInputView`
- `conversation.input.dock` id=`goal` order=10 → `GoalDock`
- `ctx.conversationEvents.register(goalCommandInputDefinition)`；`ctx.locale.register('goal', {zh,en})`

---

## 2. ui-jobs（后台任务列表）

目标：会话头一个后台任务入口。数据完全来自 `jobsBySession` 列表镜像（runtime 从 `session/jobs` 帧折叠而来），本包**不发任何 RPC、无 store**，仅持 popover 可见态。是**只读**列表（无取消按钮——取消是单独维护阶段）。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `JobListAction.tsx` → `JobListAction` (注册组件) | 会话头触发按钮（badge 计数 + 状态圆点 + 下拉箭头）→ popover 扁平任务列表；每行：状态圆点、任务 kind、label、状态词(有 detail 则用 detail)、已用时长方| `useSessions(s => s.jobsBySession[sessionId])` `JobView[]` | `conversation.session.header.actions`，id=`job-list`，order=20 | **无任务时整控件不渲染**(`jobs.length===0 → null`)。badge 只数 running+stopping，为 0 时省略只留下拉。列表排序：live 行按 startedAt 升序在前，settled 行按 finishedAt 降序在后；同毫秒以 start 序破平。**每 1 秒 tick 一次进度**，仅在打开且含 live 行时跑；settled 冻结于 finishedAt，缺失 finishedAt 读作 0（不显示负值）；超 1 小时仍在「小时」不扩到天。Escape 或点外部关闭；最后一个任务消失自动先关列表再卸载 |
| `locales.ts` | 文案字典（`job` 命名空间，zh/en 双语） | 静态 | 注入 `ctx.locale` | count.live/count.idle/status.*/duration.* 等。NS=`job` |

状态圆点映射：running→ongoing；stopping→warning；completed→done；killed→warning；failed→error。状态词：运行中/正在停止/已完成/已取消/已失败。

---

## 3. ui-message-feedback（消息赞/踩 + 备注）

目标：每条已定稿助手消息的 Like/Dislike 对 + 可选备注。注册在 `conversation.chat.assistant-actions` 的 `feedback` 项（order 10），渲染于定稿助手消息 IconActions 行内（copy 与 branch 之间）。**只有定稿消息才有 messageId 因而才有控件**；被打断冻结的局部消息无 messageId，无控件。

每个 Session 一个 `MessageFeedbackController`，一次 `list` 读播种整个对话。列表读**延迟到首次 hover/focus**（控件每条消息都挂载，不在 mount 发）。变异经 `ctx.remote.messageFeedback`（主机按 item CAS），冲突从 reply 里权威 item 调和。再次点击已记录评分=撤回；换边保留既有备注。**备注大小是主机策略**：`maxNoteBytes`（Web bundle=8192），超限保存时失败（`note-too-large`），编辑器不预检。**无跨标签页 push**（另一 tab 的评分在重连/冲突回复时可见）。**仅 chat 视图有反馈控件**——trajectory/waterfall 视图不渲染。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `MessageFeedbackActions.tsx` | Like 钮、Dislike 钮（IconLikeOutline16/IconDislikeOutline16，aria-pressed 高亮）+（有评分时）备注触发钮/内联备注编辑器(textarea + 保存/取消) + 错误/加载失败状态行 role=status | `useFeedback(view => view.items.get(messageId))`（每 Session 共享 HostObservable）+ 注入动词 | `conversation.chat.assistant-actions`，id=`feedback`，order=10 | `ensure()` 首次 hover/focus 才触发播种。按钮 Tooltip side=bottom。pending 时禁用。active=positive/negative 高亮。评分被记录后显示「补充说明」或既有备注文本；清空备注=remove |
| `controller.ts` | （非 UI，对象层）每 Session 的 `MessageFeedbackController`：status(cold/loading/ready/error)+items map | `ctx.remote.messageFeedback`(list/put/delete) | —（被 apply 注入到组件 hooks） | CAS 由主机持有；操作按 Session 串行（`operationTail`） |
| `slots.ts` | 注入协议 `MessageFeedbackInjected`（hooks.feedback Observable + ensure/rate/toggle/clearNote/clear） | 类型 | 同上 slot | target slot 声明在 ui-conversation |
| `locales.ts` | 文案字典（`feedback` 命名空间，zh/en） | 静态 | 注入 `ctx.locale` | action.like/likeActive/dislike/dislikeActive、note.*、error.conflict/load/generic。NS=`feedback` |

**槽注册**（`index.ts` `apply`）：`conversation.chat.assistant-actions` id=`feedback` order=10 → `MessageFeedbackActions`；监听 `connection/reset` 对非 cold controller 做 `resync()`；卸载时 dispose 所有 controller。

---

## 4. ui-user-questions（用户提问卡片 单选/多选 + 计划审阅）

目标：`conversation.composer` 键控槽的 `question` 条目（selector 路由）。**主机半是空**——工具本身是 agent 能力（`dsh-tool-ask-user` 装在需要它的 preset，不在 UI 包）。

一次渲染一个问题（带分页导航），支持单选/多选、推荐徽章（由 label 后缀 `(recommended)`/`(推荐)`/全角形式派生）、自定义答案。多选草稿打开/编辑自定义答案时保留已选；单选自定义独占。详细文本复用 `MarkdownText`（GFM + 非信任内容策略）。顶部条/导航/提交固定，中间长内容内滚。单选选项立即前进；Enter 提交（全答或跳过）——IME 组合中 Enter 只确认候选不前进。提交 = 整组结构化 answer batch；「跳过本题」保留其他草稿并对其发空白 `{selected:[]}`；点 X 关闭以 `ASK_CANCELLED` 拒绝整组等。

**`plan-review` 呈现意图** → 渲染成等待审批卡片 `PlanReviewPanel`（`Plan review` 条 + 计划 markdown 滚动体 + 问题文本作卡片可读名 + 一行决策：`去聊天里说`/`拒绝`/`确认执行`）。Approve/Refuse 以 asker 的 option label 应答（intent 指认 approve label，verdict 不依赖选项顺序），asker 描述作 tooltip；「去聊天里说」以 `ASK_CANCELLED` 拒绝整组返回 composer。面板只在能表达该请求全部答案时才接管（单问句 + 声明了 intent + 计划作 detail + 具名 approve label 在场 + 二元单选，至多 approve 外一个选项且非多选）；其余走通用流。intent 只改布局不改可达答案。

选择态局部于按 rpcId 键控的组件；同 id replay 保留未卸载草稿；host `question/resolved` 移除 composer。host 权威：成功 HTTP 投递不在本地移除 pending。**未提交草稿不持久**（重连重载只还原 host 的 pending 请求，卸载重置选项/自定义草稿）。**一次一组问题**，之后 pending 请求等前一组解析后可见。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `QuestionComposer.tsx` → `QuestionComposer` (注册组件) | 路由分发：`planReviewOf()` 判定 → 通用 `QuestionFlow` 或 `PlanReviewPanel` | `props.matched`（selector 命中的 `PendingWait<'question'>` carrier），经 `PendingQuestion` 域面 | `conversation.composer`，entry `question`（selector `selectQuestion`：`interactions.find(kind==='question')`） | 键控 `key={pending.key}`；`useMemo` 铸造 `PendingQuestion`/`planReviewOf`，不再在 dispatch 里铸 |
| `QuestionFlow`（QuestionComposer.tsx 内部） | 分页问卡片：header（可选 eyebrow + 问题标题 + 最小化/关 icon 钮）→ 若未最小化：body（可选 Markdown 详情 + 选项区：单选 radiogroup 数字标号 / 多选 checkbox + 每项 label + 推荐徽章 + 可选描述 + 自定义答案行 [有选项时单行 input + 编辑图标；无选项时 textarea]）→ footer（上/下翻 icon + `index+1 / total` 进度 + role=status 反馈 + `跳过本题` outline + 主按钮 [下一题/提交/提交中]） | `PendingQuestion.questions` + 局部 `drafts` state（按 index） | 同上 composer | 选项按钮 role=radio/checkbox（aria-checked）；多选保留已选、单选自定义清空已选；选项 Enter=全部完成时提交全部；自定义 input/textarea Enter/Shift+Enter/IME 分支；最小化状态保留草稿；autofocus 每问题一次（focusedQuestions ref） |
| `PlanReviewPanel.tsx` | 计划审批卡：tinted 带色点 `计划待审` 条 → 计划 markdown 滚动体（`MarkdownText`）→ footer role=status + 右对齐动作行 `去聊天里说`(ghost+编辑图标) / `拒绝`(outline，可选) / `确认执行`(primary) | `review`（`planReviewOf` 收窄：id/question/plan/approve/(decline?)）+ `pending.answer/cancel` | 同一 composer entry | 一次性 latch（busy），仅 host resolved 帧后才离开；发送失败 re-arm 并展示错误。asker 描述作 `title` tooltip；`decline` 缺失时只显示两钮 |
| `contract/slots.ts` | 域契约（非 UI）：`QuestionWait`/`QuestionAnswer`/`PlanReview`/`planReviewOf()`/`PendingQuestion` 域面（answer/cancel 编码 wire） | carrier payload + Remote | — | question 协议（answer 形状、cancelled 错误、receipt 检查）全在此 |
| `locales.ts` | 文案字典（`question` 命名空间，zh/en） | 静态 | 注入 `ctx.locale` | error.incomplete/unanswered、nav.*、option.recommended、custom.placeholder、action.skip/next、plan.header/approve/decline/discuss。NS=`question` |

**槽注册**（`index.ts` `apply`）：`conversation.composer` entry（selector `selectQuestion`）→ `QuestionComposer`；`ctx.locale.register('question', {zh,en})`。

`parseRecommendedLabel` 正则：`/\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i`（既有半角也有全角括号，大小写不敏感）。

---

## 易遗漏交互汇总

- **goal**：整条条在加载/无目标/完成/已清除时不渲染；创建不在 UI（`/goal` 命令）；暂停仅 active、恢复仅 paused；编辑是条内内联（非弹窗）；清除成功后立即抑制该 id（等投影 null 跟上）；双击/快速连点由 ref+`pending` 单飞行护栏。
- **jobs**：`jobs.length===0` 时不渲染任何东西；badge 只数 running+stopping，0 则省略；**只读列表没有取消按钮**；live 行每秒 tick、settled 冻结；排序 live 先(start 升序)后 settled(finished 降序)；Escape/点外部关闭、最后一个任务消失先关列表。
- **feedback**：**免疫中断冻结消息（无 messageId 无控件）**；每 Session 一个 controller、一次 list 播种全对话，且**读延迟到首次 hover/focus 而非 mount**；再点同评分=撤回、换边带备注；备注不清空保留、清空=remove；超 8192 字节保存时失败；trajectory/waterfall 视图无控件；跨标签页不即时同步。
- **user-questions**：同一组件两条路径——intent=`plan-review` 走审批卡（`去聊天里说`=取消返回 composer），否则通用分页问卡片；单选选项立即前进、多选不自动前进；"跳过"保留其他草稿并只把该题发 `{selected:[]}`；X 关闭以 ASK_CANCELLED 整组拒绝；IME 组合中 Enter 只确认候选；最小化保留草稿但卸载即丢（不持久）；一次一组问题串行。
