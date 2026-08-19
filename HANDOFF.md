# DeepSeek Zion 交接文档(Handoff)

> 交接时间:2026-08·会话后半(UI 功能入口差距补齐轮)。交接人:deepseek-v4-flash on DSH。接任对象:**本机新会话**(继续「补差距」)或 clone 本仓库的任意 agent。
> 本文件是接任**首要必读**入口;重复内容一律指向既有文件:`SYNC.md`(官方更新同步)、`CONTEXT.md`(领域词表/红线)、`docs/ui-entry-gap-inventory.md`(UI 入口差距执行索引)、`docs/real-backend-only-verification.md`(真后端专属项核验 + 400 归因)、`renderer/M1-验收记录.md`。

---

## 0. 一句话项目定位与当前状态

`deepseek-zion` = DeepSeek Harness(DSH)的桌面 GUI:**自建 React 18 + Vite 复刻 renderer,数据层直接用官方纯类(B 直拼),插件底座承接 community 插件**;零 cordis 装配,`/api` proxy 直连真后端(3080)。

**当前阶段(本会话主线)**:功能接线收尾(已完成)→ **真后端专属项核验(26/26)** → **UI 功能入口差距补齐(进行中)**。目标:`官方 UI 可点的入口在 replica 中全部存在且可用`,每项以官方 3080 为基准、探针验证、真后端可操作。

**进行中的 goal(round 8/30,跨机交接后继续)**`:goal-284dc56d`(max 30 轮)。objective:①②③④⑤ 五类差距补齐(见 §3)。已完成的核验/补齐:
- ① TrajectoryView ✅ real 6/6 + fixture 10/10
- ② 设置界面(壳+通用+Provider 编辑)✅ real 11/11 + 10/10
- ③ dynamicCordisRunner 运行编排 UI ✅ real 7/7
- P1 模型两级菜单 ✅ real + fixture 7/7
- P1 **权限三面 + Plan chip** ✅ fixture 12/12 + real 12/12(本轮)
- P1 **信息层三件套(ContextMeter / StatsLine / TodoDock)** ✅ fixture 6/6 + real 7/7(本轮)
- P2 **会话行 … 菜单 + 视图选项菜单** ✅ fixture 8/8 + real 8/8(本轮)
- P2 **拖拽重排 + 溢出展开** ✅ fixture 6/6 + real 6/6(本轮)→ **P2 全清**
- P3 **QueueDock 行内编辑 + 运行中排队发送** ✅ 3/3(本轮;InputBar 运行中同时显示 停止+发送,补上官方 composer 队列姿态缺口)
- P0 **JobListAction 作业 badge** ✅ probe-jobs fixture 9/9 + real 10/10(本轮;见 §3A 已执行)
- P0 **消息时间戳收尾(MessageIconActions)** ✅ probe-msg-actions fixture 8/8 + real 8/8(本轮;vendor 激活 MessageIconActions:复制/分支图标 + hover 时间戳 + user 行 clock=start;forkSession 补 select 重试)
- P1 **附件 Lightbox / 拖放覆盖层(ui-attachment)** ✅ probe-attachment fixture 8/8 + real 8/8(本轮;消息图片 ImageGallery/MessageImage → Lightbox,loader=session.readAttachment;InputBar AttachmentRail + document 拖放 + DropOverlay)
- P1 **ProducedFiles 产物行(ui-deliverables)+ WorkflowRun 面板(ui-workflow-run)** ✅ probe-deliverables fixture 6/6 + real 6/6(本轮;deliverablesDefinition 累积(tool locations 派生)+ turn-tail 产物行(host.openPath);workflowRunDefinition + WorkflowRunPanel(DisclosureRow 补 vendor);fixture 补 locations 与 tool-workflow 事件族)
- P1 **SkillRow 专用工具卡(ui-skill)** ✅ probe-skill fixture 5/5 + real 5/5(本轮;vendor SkillRow(toolview 本地化)+ ChatView skill 分支;`/` 触发源随 ⑥ MenuView 一并接入)
- P2 **`/` 触发菜单 MenuView + popupSelect(ui-input-trigger + ui-commands)** ✅ probe-trigger fixture 9/9 + real 9/9(本轮;vendor input-trigger 核心/controller/MenuView + commands popup 壳;zion 管线:command/skill 双源 + /permission popupSelect 装饰(Full access 风险确认)+ actx shim + track 去重;InputBar 键入触发/仲裁/锚点)
- P3 **ApprovalPanel composer 接管 + QuestionComposer/PlanReview 区分(ui-conversation skeleton + ui-user-questions)** ✅ probe-takeover fixture 8/8 + real 8/8(本轮;vendor ui-user-questions 整包;激活 vendored ApprovalPanel;tsconfig paths 把 `@deepseek-ai/dsh-client-ui-conversation/client` 解析到 vendored chat-nodes.ts → 官方 ChatNodeDataMap 增强真实 merge(9 个基线错误文件清零);ComposerSeat 链选举(approval>question>InputBar);**移除 M3 InteractionDock 独立卡**(官方语义:挂起交互接管 composer,聊天流不重复渲染);fixture 常驻审批配对在飞 bash 调用(turn 78)+ 稳定 question rpcId;探针缝 rpcId 显式化;回归全绿:trigger/skill/msg-actions/checklist/jobs/deliverables/attachment/m3/queue-edit)
- P3 **Agent 预设四表面(ui-agent-preset)** ✅ probe-preset fixture 10/10 + real 9/9(本轮;vendor ui-agent-preset 整包(4 组件+3 控制器+PresetMenu);zion 适配三控制器装配 + 四座位(hero chip/会话头标签/通用区行/设置分区);manager 快照补 ids/byId 等位(官方 SessionListState 面);ui-settings 等位 SlotMap;fixture settings.update 补 agent-presets ns;深绿调色板补缺令牌并修正上一轮浅色误值;probe-preset:hero 暂存→新建会话自动应用→会话头标签;通用区行往返;分区复制/查看/删除/设默认全链路;real 真实 roster 渲染)
- P3 **Miller 目录浏览弹窗(ui-directory-picker-browse)** ✅ probe-directory fixture 9/9 + real 9/9(本轮;vendor DirectoryBrowser 纯组件(Translate 改从 ui-slots 导入)+ zion 适配(host.listDirectory/createDirectory → workspace.create,失败留窗)+ WorkspaceMenu 新建工作区改开应用内弹窗(原生 picker 退役);probe-directory:主目录单栏(隐藏项默认不可见)→ 双栏 → 推进 → 新建文件夹 → 路径编辑 → 显示隐藏 → 打开创建;real:3080 未装配 browse 能力 → 官方同款诚实报错面)
- P3 **子代理目录树 + 只读 composer(ui-subagent)** ✅ probe-subagent fixture 6/6 + real 6/6(本轮;vendor ui-subagent(目录树 + 只读 composer)+ ts-types dsh-subagent 占位(subagentTiming 投影)+ 会话头目录树座位(展开/打开子级/openChild=selectSession)+ ComposerSeat 链只读分支(官方 priority -10:one-shot/父离线未运行,approval>question>只读>InputBar)+ fixture 目录样本(Beta 可继续→Gamma 一次性);probe-subagent:计数徽标 → 树行 → 展开 → 打开 Gamma → 只读 composer 无输入条 → 回选父会话恢复;real 无子代理隐藏动作(官方同款))
- ⑤(部分) 消息复制/分支 ✅ real 6/6
- ④ 会话导出按钮 → **已核定为 N/A**(官方 web 客户端无该按钮,`downloads` 是 host-only 通道;见 §3)

---

## 1. 最近提交链(自本会话;`main` 最新行在前)

| 提交 | 内容 |
| `(本轮,见 git log)` | 子代理目录树 + 只读 composer ⑩:vendor ui-subagent(目录树/只读 composer)+ ts-types dsh-subagent 占位(subagentTiming 投影 merge)+ 会话头目录树座位(openChild=selectSession)+ ComposerSeat 只读分支(priority -10 语义)+ fixture subagents.list 目录样本;probe-subagent fixture 6/6 + real 6/6 |
| `(本轮,见 git log)` | Miller 目录浏览弹窗 ⑨:vendor ui-directory-picker-browse(DirectoryBrowser;Translate 改从 ui-slots 导入)+ zion 适配(host.listDirectory/createDirectory → workspace.create)+ WorkspaceMenu 新建工作区改开应用内弹窗;probe-directory fixture 9/9 + real 9/9 |
| `(本轮,见 git log)` | Agent 预设四表面:vendor ui-agent-preset(4 组件+3 控制器+PresetMenu+locales)+ zion 适配(三控制器/四座位/rosterChanged 联动)+ manager 快照补 ids/byId 等位 + ui-settings 等位 SlotMap + fixture settings.update 补 agent-presets ns + 深绿调色板补缺令牌(修上一轮浅色误值);probe-preset fixture 10/10 + real 9/9 |
| `(本轮,见 git log)` | composer 接管 ⑦:vendor ui-user-questions(QuestionComposer/PlanReviewPanel;去 merge import)+ 激活 vendored ApprovalPanel(两处 surgical)+ tsconfig paths → vendored chat-nodes.ts(官方 ChatNodeDataMap 增强 merge)+ ui-layout 等位 SlotMap + 移除重复 SlotMap 声明(TS2717)+ ComposerSeat 链选举 + 移除 M3 InteractionDock;fixture 常驻审批配对在飞 bash(turn 78)+ 稳定 question rpcId + 探针缝 rpcId;probe-takeover fixture 8/8 + real 8/8 |
| `(本轮,见 git log)` | 触发菜单 + popupSelect:vendor ui-input-trigger(core/controller/MenuView,controller actx 本地化)+ ui-commands(popup/PopupSelectView)+ primitives useAnchoredMaxHeight;zion 管线(command/skill 源 + /permission 装饰 + actx shim + track 去重)+ InputBar 接线;probe-trigger fixture 9/9 + real 9/9 |
| `(本轮,见 git log)` | SkillRow 专用工具卡:vendor ui-skill(surgical ToolCallViewProps 本地化)+ ChatView skill 分支(settled 名取自 block.call.name)+ fixture turn 76 skill 样本;probe-skill fixture 5/5 + real 5/5 |
| `(本轮,见 git log)` | 产物行 + WorkflowRun 面板:vendor ui-deliverables/ui-workflow-run(+primitives DisclosureRow/MarkdownFileMentions;deps dsh-tool-workflow/dsh-workflow)+ 注册两个 Definition + ChatView turn-tail 产物行/keyed 面板 + fixture locations/tool-workflow 样本;probe-deliverables fixture 6/6 + real 6/6 |
| `(本轮,见 git log)` | 附件 Lightbox/拖放覆盖层:vendor ui-attachment 整包(4 组件零 cordis)+ ChatView 消息图片(ImageGallery,loader=readAttachment)+ InputBar AttachmentRail/DropOverlay/Lightbox + document 拖放监听;probe-attachment fixture 8/8 + real 8/8 |
| `(本轮,见 git log)` | 消息时间戳收尾:激活 vendored MessageIconActions(图标复制/分支 + hover 时钟 + user 行动作),补 primitives writeClipboard / locale-common(common 词表)/ forkSession select 重试;probe-msg-actions fixture 8/8 + real 8/8 |
| `(本轮,见 git log)` | JobListAction 会话头作业 badge:vendor ui-jobs + ui-primitives 补 StateDot/useDismissOnOutsidePointer + 会话头座位 + __zionProbePushMuxFrame 探针缝;probe-jobs fixture 9/9 + real 10/10 |
| `b7be773` | QueueDock 行内编辑(updateQueue edit)+ InputBar 运行中排队发送;fixture edit 分支真实替换;probe-queue-edit 3/3 |
|---|---|
| `6fa73d5` | 拖拽重排 + 溢出展开:组内会话行拖拽(上/下半标记 → insertSessionBefore)、工作区组头拖拽(insertBefore)、host/workspace-* 帧自动刷新账目、溢出折叠 5 行 + 「+N」展开;probe-sidebar-drag fixture 6/6 + real 6/6 |
| `b193d83` | 会话行 … 菜单(重命名 Modal/fork 省略 atSeq 选中子代/archive)+ 视图选项菜单(groupBy workspace|flat 按 WorkspaceView.sessionIds、orderBy manual|updated);runtime sessionRowActions;fixture archive 补 host/session-removed;probe-workspace-actions fixture 8/8 + real 8/8 |
| `346fcad` | 信息层三件套:runtime 通用 useProjection(per-key uSES)+ ContextMeter/StatsLine/TodoDock seat;ts-types 补 token-meter/session-stats/tool-todo 占位;probe-composer-stats fixture 6/6 + real 7/7 |
| `c2a1467` | 权限三面 + Plan chip:vendor ui-permission-presets/ui-plan/schema-form + ui-primitives 补 Menu/Button/Modal/RiskConfirmation;Settings 权限默认行 + composer 权限 chip(Full access 风险确认)+ PlanSeat;fixture 扩展 permission ns;probe-permission-plan fixture 12/12 + real 12/12 |
| `beed201` | 消息行动作:复制 + 分支(fork at anchorSeq),real 6/6 |
| `396255a` | dynamicCordisRunner 编排 UI:运行控制台(inventory+Run/Update)+ 审批卡「批准并信任」,real 7/7 |
| `06dc363` | 模型两级菜单:vendor ui-model-selection 替换扁平 select,real+fixture 7/7,回归 24/24 |
| `35723e6` | 设置二期:Provider 编辑(API key + 模型目录 + discoverModels 探活),real 10/10 |
| `e188d21` | 设置一期:壳+分区导航+通用(外观/语言 读写真后端),real+fixture 11/11 |
| `8ef3b62` | TrajectoryView:vendor ui-trajectory + 会话头 tabs,real 6/6 + fixture 10/10 |
| `667d5ce` | 真后端专属项核验 26/26(模型守卫/settings/credentials/llm/cordis/export/updateQueue)+ 归因文档 |
| `1a0cea3` | 功能接线:session.create / 命令面板 / goal 编辑器 / 工作区 / subagent / 队列场景 |
| (更早) | M1 diff 卡 `2877299`、两份审计 docs `27fc77d`;M6 之前链条见旧版 §1 已并入 git log |

---

## 2. 架构与运行(不变 + 新增)

### 架构事实(仓库注释 + 旧 HANDOFF §1 有;摘要)
- 数据层 = 官方纯类 B 直拼:`renderer/vendor/`(现 **12 包+类型占位**,§4 有清单)由 Vite 直编;装配 `protocol/assemble.ts`;React 侧 `app/runtime.tsx` 用 `bindSnapshotSelector`.
- 对话定义层 = 一个「UI 逻辑面」`new Context()`(`app/conversation.ts`),注册 chat 节点 + **trajectory 6 个节点 Definition**.
- 插件底座 = `renderer/src/plugin/`(runtime/slot-registry/evaluator/guard/hub/remote/run-orchestrator/anchors).
- **两条运行线(别混淆)**:复刻线 = `npx vite preview ... --port 5199`(或 `dev:web`)经 `/api` proxy 连 3080,不带 `?fixture` 即真后端;**Electron 壳线是 prototype 遗留**(`npm run dev/start` 加载官方 3080 UI,不是复刻).
- 探针:`npx electron <probe>.mjs` 无头加载 `http://localhost:5199/[?fixture]`;fixture 页 authority 必须 `?fixture`.

### 本会话新增关键机制(vendor + 适配层)
- **官方 UI 包 vendor 流程**(补差距的标准做法):
  1. 拷贝:`D:\github-Clone\deepseek-harness\packages\client\<pkg>\src` → `renderer/vendor/<pkg>`(TS 源码直编).
  2. `renderer/vite.config.ts` 加 alias;`renderer/tsconfig.json` `paths` 加映射(type-only 缺失包用 `renderer/vendor/ts-types/*.d.ts` 空占位).
  3. 依赖入 `package.json`(本轮已加 `@tanstack/react-virtual`、`diff`、`clsx`).
  4. **适配层**:官方组件经 cordis 槽注入面;zion 手写 adapter 补齐注入(参考 `src/app/trajectory-pane.tsx`、`src/app/model-select.tsx`).
  5. `npm run build:web` + 探针(real/fixture 双轨)+ tsc(`src/` 0 新错;vendor 的 cordis 类型噪音是既有预期).
- **官方 declare-module 增强的 zion 解析法**(本轮,P3-⑦):官方各 conversation-nodes/*.ts 以
  `declare module '@deepseek-ai/dsh-client-ui-conversation/client'` 增强 ChatNodeDataMap;
  zion 无该包 → tsconfig `paths` 把包名解析到 **声明该接口的 vendored 模块文件**
  (`vendor/client-ui-conversation/client/contract/chat-nodes.ts`),增强即真实 merge
  (ChatNodeKind 键源齐全,9 个基线错误文件清零);同法适用于任何「官方 declare module 增强
  某接口」的包,前提是该包名不被其它具名导入消费(消费其它导出会断)。
- **vendor 包现状**:`client-connection / client-runtime / client-ui-conversation / client-ui-slots / client-web-react / ui-primitives(最小面:icons 全表 + Tooltip + JsonTree/MarkdownText/Toast/plain-text + Menu/Button/Modal/RiskConfirmation/pointer-grace)/ ui-trajectory(完整)/ ui-model-selection(完整)/ ui-plan(完整)/ ui-permission-presets(完整)/ ui-user-questions(完整)/ ui-agent-preset(完整)/ schema-form(完整)+ ts-types`.alias 与 paths 均已配好,后续 vendor 新包照抄;npm 依赖另加 `@deepseek-ai/schemastery`(file: 官方链,schema-form 需要).
- **ui-primitives 是「最小等位面」**:icons 全表 + 官方 Tooltip + 自写 JsonTree/MarkdownText/Toast(plain-text 投影),刻意不拉整棵 micromark;整包 vendor 时整体替换。
- **workspace 账目自动刷新**(本轮,runtime.tsx):zion 不跑官方 WorkspaceRuntime,workspaces 状态此前只靠显式 reload;现接 host/workspace-changed|removed|added 帧自动 reloadWorkspaces(分组/手动排序/拖拽落点跟着变;fixture fork 时子会话因此正确入组而非落「未分组」)。
- **拖拽合成事件**(本轮,probe):dragstart/dragover/drop 需在事件间 sleep(React 状态提交是异步的,同步派发时拖拽源尚未就位);真实拖拽天然间隔足够。
- **fork 选中竞态**(上轮,runtime.tsx sessionRowActions.fork):host/session-added 帧可能晚于 RPC 响应到达,`sessions.select` 对未知 summary 抛错 → 重试至 deadline(3s/40ms)。真后端帧序通常先到,fork 既往路径(消息分支)未暴露。
- **useProjection 通用钩子**(上轮,runtime.tsx):per-key uSES 绑定选中会话 ProjectionValueStore,`undefined` = 能力缺失;官方第五框架席位。ContextMeter/StatsLine/TodoDock/PermissionSelect/PlanChip 全部经它读投影(useGoal/usePlanProjection/usePermissions 保持专用绑定不动)。
- **本轮 vendor 注意点**:
  - `ui-permission-presets` 的 settings-store 依赖 `@deepseek-ai/dsh-client-schema-form`(runtime)→ vendor schema-form(3 文件)+ schemastery npm 依赖;真后端 `permission` ns 的 schema 是 schemastery toJSON(refs/uid 引用表),`new Schema(envelope)` 直接可解析。
  - `PermissionRow`/`PlanChip` 需要的 SlotMap/LocaleNamespaceMap merge(`settings.general.item`、`conversation.input.plan`、`plan`)由 zion 适配文件 `declare module` 等位补齐(官方声明在未编译的 ui-settings/ui-conversation contract 里)。
  - 两个官方文件被微补丁(留注释标记):`skeleton/PermissionSelect.tsx` 的 `t` 类型本地化(不拉 contract/slots.ts);`ui-plan/client/PlanModeControl.tsx` 的 `PlanChipInjected` 本地化(不拉 cordis apply 的 index.ts)——都是避免把整套槽面拖进编译面的 surgical 修改,行为零改动。
  - fixture 的 `settings.describe` 扩展出 `permission` ns(schemastery envelope + mutate 往返),供探针走 Full access 风险确认全流程。

---

## 3. 后续工作(接任继续;执行索引 = `docs/ui-entry-gap-inventory.md`)

## 3. 后续工作(接任继续;执行索引 = `docs/ui-entry-gap-inventory.md`)

> 执行表按用户确认顺序排列(快分 → 中块 → 大块 → 收尾);每项照 §2 的 vendor 流程 + 探针验证(real/fixture 双轨),完成后回勾 inventory 并提交。规模为轮数估计(1 轮 ≈ 30–60 分钟紧凑工作)。

| # | 优先级 | 项 | 规模 | 关键要点 |
|---|---|---|---|---|
| 1 | P0 快分 | **JobListAction 作业 badge**(ui-jobs) | 0.5–1 轮 | 计划见 §3A(StateDot/useDismissOnOutsidePointer 补齐 + ui-jobs vendor + 会话头座位 + __zionProbePushMuxFrame 探针缝);jobsBySession 数据已有 |
| 2 | P0 快分 | 消息时间戳收尾(MessageIconActions) | ≤0.5 轮 | 复制/分支已做(beed201);核对官方 chat/MessageIconActions 的 hover 时间戳与当前 chat-node-actions 差异,补齐即可 |
| 3 | P1 中块 | 附件 Lightbox / 拖放覆盖层(ui-attachment) | 1 轮 | 先确认 ChatView 消息图片渲染现状(输入侧已支持图片);vendor MessageImage/ImageLightbox/DropOverlay/AttachmentRail 4 组件,MessageImage 点击 → Lightbox 全屏;拖放覆盖层挂 InputBar |
| 4 | P1 中块 | ProducedFiles / WorkflowRun 面板(ui-deliverables / ui-workflow-run) | 1 轮 | 节点 Definition 注册(参考 trajectory 注册链,conversation.ts);deliverables 投影/事件面先探真后端是否推送 |
| 5 | P1 中块 | skill 行(ui-skill) | 1 轮 | skill.list RPC 已在 wire(fixture 有 skill.list 分支);SkillRow 槽面声明 + Sidebar/会话头座位 |
| 6 | P2 大块 | **`/` `@` 触发菜单 MenuView + popupSelect**(ui-input-trigger + ui-commands) | 1–2 轮 | 全仓库最大 vendor 块;含 `/permission` popupSelect 装饰(承 P1);InputBar 输入触发改造(键入触发、候选行、popupSelect shell);CommandUiContract 类型 stub 已在 ts-types |
| 7 | P3 收尾 | ApprovalPanel composer 接管 / PlanReview 区分 | 1 轮 | InteractionDock 现为旁路卡,官方替换 composer;ui-user-questions 的 PlanReview 与审批两形态 |
| 8 | P3 收尾 | Agent 预设四表面(ui-agent-preset) | 1 轮 | 选择/copy/删除/查看/打开文档;agentPreset.* RPC 已在 wire(fixture 全分支) |
| 9 | P3 收尾 | Miller 目录浏览弹窗(ui-directory-picker-browse) | 1 轮 | 680×500;hidden/新建目录;host.listDirectory/createDirectory 已在 wire |
| 10 | P3 收尾 | 子代理目录树 + 只读 composer(ui-subagent) | 1 轮 | 现右栏扁平列表;目录树下拉 + 展开/打开子级;subagents RPC 已通 |
| 11 | P3 收尾 | cordis 面板增强(run/stop/remove/版本/approve-plugin/retry-rollback)+ define/run 卡 | 1–2 轮 | 接已有 orchestrator + remote;PluginHost 控制台补 stop/remove 等(现 disabled 说明) |

**已核 N/A(不必做)**:会话导出按钮(官方无 UI);消息赞/踩+备注(真后端 3080 无 messageFeedback.* 端点,404 已探);DetailsPanel(官方未接线);native 目录流(renderless)。

**收尾标准(每项)**:① 官方 3080 为基准核对入口形态;② vendor/手写 + 适配层接线;③ `npm run build:web` + 双轨探针(新探针写进 §4 表);④ typecheck 与基线持平(对比 `baseline-errors.txt` 列表,31 文件,不新增);⑤ 回勾 inventory + HANDOFF §1 提交链 + §0 进度。全部完成即 §0 目标达成,goal 标 complete。

### 真后端核验关键结论(别重踩)
- **模型守卫**:`agent-default-model` = opencode-go / deepseek-v4-flash(reasoningEffort max);任何 LLM 调用都落它(`settings.describe`/`llm.providers`/`llm.models`/`session.models` 四重证据,见 `docs/real-backend-only-verification.md`).
- **400 归因**:`Error from provider (Console Go) ... tool_count_limit` = 上游 pi-ai 网关对 opencode-go 通道因**工具 schema 数超限**拒绝,与复刻无关;纯文本回合不触发。
- 探针选会话注意:点「根级(depth0)且非运行」行(子代理行模型 RPC 被拒 `agent-busy`;运行中会锁定模型选择器)。队列/轨迹快照经 **mux WebSocket**(真后端对 SSE GET `/api/events.mux` 回 426)。
- 3080 真后端常驻(勿重启,会话骑在它上);需 5199 时先起 preview,源码改动后先 `npm run build:web`(preview 服务的是 dist/)。

---

## 4. 探针清单(全部可用:`npx electron <name>.mjs`;输出 `probe-*-out/` 已 gitignore)

| 探针 | 作用 | 数据源 | 结果 |
|---|---|---|---|
| `probe-checklist.mjs` | 24 项真后端回归(模型席断言已按两级菜单更新) | 3080 | 24/24 |
| `probe-backend-only.mjs` | 真后端专属项(模型守卫/settings/llm/credentials/cordis/export/updateQueue) | 3080 | 26/26 |
| `probe-trajectory.mjs` | 轨迹视图(tabs/工具栏/搜索/切换) | fixture | 10/10 |
| `probe-trajectory-real.mjs` | 轨迹视图真实回合账本渲染 | 3080 | 6/6 |
| `probe-settings.mjs` | 设置壳/通用(外观三 cube+语言 读写真后端) | 3080+fixture | 11/11 |
| `probe-settings-editor.mjs` | Provider 编辑(模型目录增删往返/凭证态/探活) | 3080 | 10/10 |
| `probe-model.mjs` | 模型两级菜单(根/模型/Effort/选择/锁定) | 3080+fixture | 7/7 |
| `probe-cordis-console.mjs` | cordis 运行控制台 + 批准并信任 | 3080 | 7/7 |
| `probe-msg-actions.mjs` | 消息复制/分支(fork+选切子会话) | 3080 | 6/6 |
| `probe-permission-plan.mjs` | 权限行(Full access 风险确认往返)/ composer 权限 chip / Plan chip(激活→关闭) | 3080+fixture | 12/12 |
| `probe-composer-stats.mjs` | ContextMeter 环+组成面板 / StatsLine 统计条 / TodoDock plan strip | 3080+fixture | 7/7 |
| `probe-workspace-actions.mjs` | 视图选项(分组/排序)/ 行 … 菜单(重命名/fork/archive) | 3080+fixture | 8/8 |
| `probe-sidebar-drag.mjs` | 拖拽重排(insertSessionBefore 顺序落点)/ 溢出折叠展开 | 3080+fixture | 6/6 |
| `probe-jobs.mjs` | JobListAction 会话头作业 badge(注入帧徽标/列表排序/时钟实时走/外点+Escape 关闭/空帧消失;real 真实 jobs 数据) | 3080+fixture | 9/9 + 10/10 |
| `probe-msg-actions.mjs` | 消息行动作(图标复制/分支/hover 时钟/user 行/fork 选中子会话) | 3080+fixture | 8/8 + 8/8 |
| `probe-attachment.mjs` | 附件(消息图片缩略图/Lightbox/Escape;合成拖拽 DropOverlay → AttachmentRail → 移除) | 3080+fixture | 8/8 + 8/8 |
| `probe-deliverables.mjs` | 产物行(edit/write locations 派生 + chip 点击 openPath)+ workflow-run 面板(run 头/阶段展开/成员状态) | 3080+fixture | 6/6 + 6/6 |
| `probe-skill.mjs` | skill 专用工具卡(状态/标题/摘要 + 展开说明区/收起) | 3080+fixture | 5/5 + 5/5 |
| `probe-trigger.mjs` | 触发菜单(`/` 命令+技能组/过滤/pick 落文本/Escape)+ popupSelect(/permission 预设/执行/令牌移除) | 3080+fixture | 9/9 + 9/9 |
| `probe-takeover.mjs` | composer 接管(ApprovalPanel 审批卡+配对命令/允许一次 → QuestionComposer 三问 → 结算 InputBar 回归;合成 plan-review → PlanReviewPanel 决策卡+拒绝回执+结算离场;real 空闲回退) | 3080+fixture | 8/8 + 8/8 |
| `probe-preset.mjs` | Agent 预设四表面(hero chip 暂存→新建会话自动应用→会话头标签;通用区默认行往返;分区:复制对话框/只读查看器/删除确认/设默认;real 真实 roster 只读) | 3080+fixture | 10/10 + 9/9 |
| `probe-directory.mjs` | Miller 目录浏览(主目录单栏/双栏推进/新建文件夹/路径编辑/显示隐藏/打开创建;real browse 能力缺失诚实报错面) | 3080+fixture | 9/9 + 9/9 |
| `probe-subagent.mjs` | 子代理目录树(计数徽标/展开/打开子级)+ 只读 composer(一次性/父离线;回选父会话恢复) | 3080+fixture | 6/6 + 6/6 |

> ⚠️ `probe-backend-only` 现为 **24/26**:A1/A6 断言的默认/会话模型期望 `opencode-go/deepseek-v4-flash`,而真后端 3080 当前选中为 `deepseek-official/deepseek-v4-flash`(后端侧模型选择漂移,与本次改动无关;待后端选回后恢复 26/26)。
> ⚠️ `probe-permission-plan` 现为 **10/12**:P3/P7 断言的权限默认值期望 `Full access`,真后端当前为 `workspace-write`(后端侧权限默认漂移,机械断言全过;恢复 12/12 需后端默认回 Full access)。

### 3A. JobListAction 实施记录(✅ 已执行,commit 见 §1 行首)
- 数据:zion manager 已有 jobsBySession(useSessions(s => s.jobsBySession[id]) 读,由 session/jobs mux 帧填充;fixture 不产生 jobs)。
- vendor 依赖补齐:ui-primitives 缺 StateDot(svg+css)与 useDismissOnOutsidePointer(hook)——官方 packages/client/ui-primitives/src/ 直拷 3 文件(StateDot.tsx/.module.css + use-dismiss-on-outside-pointer.ts),index.ts 增导出。
- vendor ui-jobs(client:index.ts / JobListAction.tsx / JobListAction.module.css / locales.ts);props = PropsRuntime<"conversation.session.header.actions"> & PropsLocale<"jobs"> → 需在 zion 适配 declare SlotMap "conversation.session.header.actions"(官方 ui-conversation contract/slots.ts 声明,kind list,scope session)+ LocaleNamespaceMap "jobs"。
- 座位:ConversationDock 会话头加 JobListActionSeat(useSessions=runtime.useSessions;sessionId=selectedId;t=zh 字典;无 jobs 时组件自返 null)。
- 探针:RuntimeProvider start 时(isFixture 限定)挂 window.__zionProbePushMuxFrame(frame) 直调 runtime.wire.sessions.handleMuxEnvelope({ rpcId: crypto.randomUUID(), payload: frame });探针注入 { type: "session/jobs", sessionId, jobs: [...] } 帧 → 徽标与列表出现;真后端只验证零错误(无 jobs 时隐藏)。
- 注意:JobView 类型来自 client-runtime(查 manager import 源头);manager.ts 705 行已有 "session/jobs" 帧分支。
(更早的 M 探针:probe-m3/real/official-real/hero/plugin/queue/cordis-*/hostcall/queue-ops/approve-* 仍在仓库。)

---

## 5. 开发约定挖坑清单(本会话新增,别重踩)

- **Windows EIO(ReplaceFileW EIO Win32 32/1175)**:esbuild/vite tsserver 持有文件句柄缺 `FILE_SHARE_DELETE`,直接 write/edit 被拒。**手法:把新内容写到临时文件(`xx.new`/`xx.cdnew`),再用 PowerShell `Copy-Item -Force` 覆盖目标**(in-place CopyFile,不需 Delete 共享);或对单点用 PowerShell 字符串 Replace + `[IO.File]::WriteAllText`。EIO 是已知环境行为,**不是 bug,换手法即可**。
- `write` 到已被删除的 `.new` 路径会报「file no longer exists」——换一个全新临时名。
- 探针用 React 受控输入:必须原生 value setter(`Object.getOwnPropertyDescriptor(proto,'value').set.call(el,v)` + dispatchEvent('input'))。
- tsc 只查 `src/`:vendor 的 cordis/Fiber/ctx 类型噪音是既有预期,`grep -v vendor` 过滤看新错。
- 探针可用 `window.__zionProbeHandleRemoteEvent(...)` 注入 `cordis/request-run` 帧测审批。
- 探针 JS 字符串经外层模板字面量转发:`split('\n')` 会被外层转义成真换行导致页面 SyntaxError——用 `split(String.fromCharCode(10))`。
- `npm run typecheck` 基线本就有 200 行错/31 文件(模型 select 的 t prop、runtime 投影 cast、vendor cordis 噪音等,历史遗留);验收口径 = **对比基线不新增错误文件**(Compare-Object 两份 error 文件列表)。
- 设置/菜单按钮的 `aria-haspopup` 全页面多个(工作区/模型/权限),探针选择器要限定作用域(`.settings-shell button[aria-haspopup="menu"]`)。
- 探针模板字面量里引用的循环变量必须 `${i}` 插值(直接写 `i` 会 ReferenceError);跨行匹配用 `split(String.fromCharCode(10))` 而非正则 `\n`(外层模板会把它转义成真换行)。

---

## 6. 环境与换机

- 工作区 `D:\deepseek-zion`;origin=github.com/elephanttalkheads/deepseek-zion(main)。
- Node/DSH:Windows;`C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\`(rc.7);DSH_HOME=`C:\Users\zyf\.dsh`;官方 npm 链 `...\.dsh\profiles\node_modules\@deepseek-ai\`(rc.7,file: 引用;junction 到底层链)。
- 官方源码 clone:`D:\github-Clone\deepseek-harness`(HEAD `dsh-v0.1.0-rc.7`;vendor 源、契约查证都看它)。
- 常用命令:`npm run build:web`(= vite build -c renderer/vite.config.ts)、`npx tsc --noEmit -p renderer/tsconfig.json`、`npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort`。
- ⚠️ `npm run dev/start` 是 Electron 壳(proto 遗留,加载官方 3080 UI,非复刻);看复刻走 5199/`dev:web`。
- 换机:`npm install`;`file:` 依赖是机器绝对路径(C 盘 profile / dsh 内嵌),换机改路径或 vendor 面包(SYNC.md 换机链);vendor 已含 10 包不额外装。

---

## 7. 红线(改代码前必看,`CONTEXT.md` 同源)

R1 宿主组合零改动;R2 wire 契约零改动(52 RPC + respond + 双 WS + session.export 只消费);R3 事件订阅完整(别丢 `host/remote-event`、`session/queue`);R4 会话语义不变(不伪造遥测);R5 无 prompt/工具/权限改动;R6 surfaceContext 保留;R7 动效不拖累主线程。

---

## 8. 建议启用的 skill(接任工作流)

- **`handoff`** — 每个大阶段/换会话前重写本文件。
- **`code-review`** — 对补差距的每一批提交做 Standards/Spec 双维 review(本会话方法:每轮 vendor+接线+探针+提交)。
- **`diagnosing-bugs`** — 探针失败回环(本会话多次据此定位:select 子代理行 agent-busy、mux SSE 426、React #310 hooks、remote 作用域 ReferenceError)。
- **`research`** — 查官方 `packages/client` 源码/契约时委托子代理;三次盘点就是这样拿到 `docs/ui-entry-gap-inventory.md` 的。
- **`writing-for-agents`** — 改 `AGENTS.md`/README/CONTEXT 等面向 agent 文档时先加载。
- **`grilling`** — 立项/目标范围不确定时压测(本项目靠 Q 系列决策定形)。
- **`vision-skills`** — 需要看截图/像素对照时(本模型无视觉输入,视觉校验留给有视觉模型的会话)。

---

*本文件由原开发会话持续维护;信息截至 `b7be773`(QueueDock 行内编辑;跨机交接)。接手后继续 §3 剩余项,按 AGENTS.md 记录。*