# zion UI 功能入口差距盘库(2026-08 · 对照官方 packages/client 源码)

> 依据:官方 clone `D:\github-Clone\deepseek-harness`(HEAD `dsh-v0.1.0-rc.7`)的
> `packages/client`(UI 侧)+ `packages/extensions`(ui-cordis),逐一读源码盘点「用户可交互入口」,
> 对照 zion 现状(`renderer/src/ui/*` + `src/app/runtime.tsx` + `renderer/vendor/*`)。
> 三色/三档:🟢 已具备;🟡 部分;❌ 缺失。补法:vendor=拷官方源码进 `renderer/vendor` 直编;
> 手写=按官方形态自写;N/A=官方 web 未接线。
> 本文件是逐个补齐的执行索引;每完成一处在本表勾掉并写提交。

## 0. 运行前提与已修正的事实
- **会话导出/下载按钮:官方 web UI 不存在**(全 client 树 `session.export` 仅出现在
  `connection/fixture.ts` 契约注释;host-only 下载通道,官方无按钮)→ 该项标 **N/A**,
  不再是差距(除非作为 zion 增值,另行评估)。
- zion `renderer/vendor` 现为 **11 包 + 类型占位**:client-connection / client-runtime /
  client-ui-conversation / client-ui-slots / client-web-react / **ui-primitives(最小面,
  含 Menu/Button/Modal/RiskConfirmation)** / **ui-trajectory(完整)** / **ui-plan(完整)** /
  **ui-permission-presets(完整)** / **ui-user-questions(完整,composer 接管)** /
  **schema-form(完整)** + `vendor/ts-types`
  (type-only 占位:locale / compaction / invariants / permission-presets / plan-mode /
  ui-commands)。npm 依赖新增 `@deepseek-ai/schemastery`(file: 官方链)。
- vendored ui-conversation 大量官方组件(Chat/skeleton)处于休眠态:zion 只消费了它的
  conversation-node 注册表与 contract;实际渲染是 zion 自研 M2/M3 组件。

## 1. 已闭环 ✅

| 差距 | 现象 | 补法 | 证据/提交 |
|---|---|---|---|
| **① TrajectoryView 轨迹视图** | 会话头无 tabs、无轨迹 | vendor `ui-trajectory`(36 源文件)+ `ui-primitives` 最小面(icons 全表 / Tooltip / JsonTree / MarkdownText / plain-text)+ 注册 6 个轨迹 Definition + 会话头 tabs + TrajectoryPane 适配 | probe-trajectory **10/10**(fixture),probe-trajectory-real **6/6**(真后端,实时回合轨迹账本渲染,零错误) |
| **Full access 风险确认 + 权限预设行(设置)+ composer 权限 chip** | 设置无「权限」行;composer 无访问模式 chip | vendor `ui-permission-presets`(PermissionRow + settings-store + presentation + locales)+ `ui-primitives` 补 Menu/Button/Modal/RiskConfirmation/pointer-grace + PermissionSettingsRow/SettingsShell 接线 + composer vendored `PermissionSelect` chip(usePermissions 投影绑定) | probe-permission-plan **fixture 12/12 + real 12/12**(风险确认勾选门、settings.mutate 往返、`/permission` 提交后投影刷新) |
| **Plan chip(`/plan off`)** | composer 无 plan mode 状态 chip | vendor `ui-plan`(PlanChip)+ PlanSeat 适配(`plan` 投影绑定,`pending ? !active : active`,点击 `/plan off`) | 同上探针 P8–P10(fixture:未激活不渲染 → `/plan` 激活 chip 出现 → 点击消失;real:投影存在未激活 → 不渲染) |
| **ContextMeter / StatsLine / TodoDock(projection 绑定)** | composer 缺上下文环/统计条/plan strip | runtime 增通用 `useProjection`(per-key uSES 绑定)+ 适配层三 seat(vendor 组件直接接线)+ ts-types 补 token-meter/session-stats/tool-todo 占位(含 SessionProjectionMap merge) | probe-composer-stats **fixture 6/6 + real 7/7**(真实投影:8 轮 · 25 步、缓存命中 89%、上下文已用 5%;todos=null 正确隐藏)。**2026-08-21 输入栏合并形态落地后**:ContextMeter 环按评审裁决移除(ui-change-log 立账),TodoDock 换自研 Matrix 版(vendor 零改动),StatsLine 移至输入框底部;探针更新为 **fixture 5/5 + real 6/6** |
| **会话行 … 菜单(重命名/分叉/归档)+ 视图选项菜单(分组/排序)** | 侧栏无行操作菜单、无分组/排序 | 手写(官方 ui-workspace 等位):行 … Menu(rename Modal / fork 省略 atSeq=最后完成回合并选中子代 / archive 无确认)+ 视图选项 Menu(groupBy workspace|flat 用 WorkspaceView.sessionIds 账目、orderBy manual|updated) | probe-workspace-actions **fixture 8/8 + real 8/8**(重命名往返、fork 子行出现并选中、archive 行实时消失;真实分组 DEEPSEEK-ZION/DSH-PLUGINS/PI-MARTIX-UI/未分组) |
| **会话/工作区拖拽重排 + 会话溢出展开** | 无拖拽、无溢出控制 | 手写(官方 DragState 等位):组内会话行拖到目标上/下半 → insertSessionBefore;工作区组头拖拽 → insertBefore;host/workspace-* 帧驱动账目自动刷新;溢出折叠 COLLAPSED_SESSION_LIMIT=5 + 「+N 个更多…」展开 | probe-sidebar-drag **fixture 6/6 + real 6/6**(3 次 fork 后组内 6 行 → 折叠 5+1 → 展开 → 拖拽到最后 → 顺序可见更新;真实分组含 >5 行组溢出按钮) |
| **JobListAction 会话头作业 badge** | 会话头无后台任务入口 | vendor `ui-jobs`(JobListAction + locales,含 surgical 改:去官方 type-only contract import)+ `ui-primitives` 补 StateDot/useDismissOnOutsidePointer + styles.css 补 4 token + ConversationDock 会话头动作座位 + RuntimeProvider `__zionProbePushMuxFrame` 探针缝(fixture 注入 session/jobs 帧) | probe-jobs **fixture 9/9 + real 10/10**(无 jobs 无控件 → 注入帧徽标出现(计数/StateDot)→ 列表运行中在前+状态点+时长 → 时钟实时走 → 外点/Escape 关闭 → 空帧消失;真后端真实 jobs 数据渲染,零错误) |
| **消息 MessageIconActions(复制/分支/hover 时间戳)** | 消息行动作是文本按钮、无时间戳;user 节点无动作行 | vendor 完整 `ui-conversation/client/chat/MessageIconActions`(休眠态转激活:补 primitives `writeClipboard` + `locale-common.ts`(官方 common 词表 + makeT)+ common 命名空间 declare;两处 surgical:setTimeout ref 类型本地化、t 类型本地化切断 contract/slots.ts 级联)+ ChatView 接线(user/steering/context clock=start;assistant clock=end + 分支 + extraActions 插件槽)+ `data-time-hover-root`;forkSession 补 select 重试(与行菜单 fork 同款竞态修复) | probe-msg-actions **fixture 8/8 + real 8/8**(图标按钮、时钟文案(real 跨日 "8月17日 19:57")、user 行无分支、fork 选中子会话、零错误) |
| **图片 Lightbox / 拖放附件覆盖层(ui-attachment)** | 消息图片不渲染;输入侧是自研 chip 行、无拖放 | vendor `ui-attachment` 整包(4 组件零 cordis)+ alias/paths + ChatView 接 ImageGallery(loader=session.readAttachment,官方 resolveImage 等位;user/assistant 图片块)+ InputBar 换 AttachmentRail + document 级拖放监听 + DropOverlay + 缩略图 Lightbox | probe-attachment **fixture 8/8 + real 8/8**(缩略图加载 → Lightbox → Escape;合成拖拽 → 覆盖层 → drop → rail → 移除;零错误) |
| **ProducedFiles 产物行(ui-deliverables)** | turn 结束无产物行 | vendor ui-deliverables(deliverablesDefinition 累积 + ProducedFiles 行,两处 surgical:TurnTailOwnerProps 本地化)+ conversation.ts 注册 + ChatView turn-tail 渲染(timeline turn 数据 `deliverables`)+ openFile=host.openPath + primitives 补 MarkdownFileMentions 类型 + fixture diff 卡补 locations | probe-deliverables **fixture 6/6 + real 6/6**(turns 61–64 四行产物 chip + 点击 openPath;真后端派生逻辑同源) |
| **WorkflowRun 面板(ui-workflow-run)** | workflow 运行无面板 | vendor ui-workflow-run(workflowRunDefinition + WorkflowRunPanel;deps 加 dsh-tool-workflow/dsh-workflow;两处 surgical:data cast + navigableMembers 容错 manager 快照)+ primitives 补 DisclosureRow + conversation.ts 注册 + ChatView keyed 渲染 + fixture 补 tool-workflow 事件族 | 同上探针 D4/D5(run 头 → 展开阶段 → 成员状态;真后端无事件时隐藏) |
| **SkillRow 专用工具卡(ui-skill)** | skill 调用渲染为通用卡 | vendor ui-skill(SkillRow;surgical:ToolCallViewProps 本地化)+ ChatView toolName==='skill' 分支(settled 名取自 block.call.name)+ fixture turn 76 skill 样本 | probe-skill **fixture 5/5 + real 5/5**(状态点/标题 Skill/摘要 code-review → 展开说明区 → 收起;真后端无 skill 调用时隐藏) |
| **`/` 触发菜单 MenuView + popupSelect(ui-input-trigger + ui-commands)** | 输入侧无 `/` 候选菜单、无命令弹窗 | vendor ui-input-trigger(core 纯逻辑 + controller + MenuView;controller surgical:actx bail 面本地化)+ primitives 补 useAnchoredMaxHeight + vendor ui-commands(popup.ts + PopupSelectView)+ zion 管线(trigger-menu.tsx:command/skill 双源、/permission 装饰 → popupSelect 壳、actx shim → draft 落盘、track 去重)+ InputBar 接线(data-composer-card/锚点/仲裁)+ 权限投影 options(Full access 风险确认) | probe-trigger **fixture 9/9 + real 9/9**(/ 菜单命令+技能组 → 过滤 → pick /permission → popup 预设 → 执行+令牌移除;普通命令/技能落文本;Escape 关闭;real 真实命令目录) |
| **ApprovalPanel composer 接管 + QuestionComposer/PlanReview(ui-conversation skeleton + ui-user-questions)** | 挂起交互渲染为独立 Dock 卡(自研 M3),与官方「接管 composer」语义不符 | vendor ui-user-questions 整包(QuestionComposer + PlanReviewPanel + contract;surgical:去不可解析 merge import)+ 激活 vendored ApprovalPanel(两处 surgical:layout merge import、dsh-brand 本地等位)+ tsconfig paths 把 `@deepseek-ai/dsh-client-ui-conversation/client` 解析到 vendored chat-nodes.ts(官方 ChatNodeDataMap 增强全部真实 merge,9 个基线错误文件清零)+ ui-layout 等位 SlotMap('conversation'/'details')+ 移除旧 `conversation.session.header.actions`/`conversation.chat.node` 重复声明(TS2717)+ ComposerSeat 直编链选举(approval 优先 > question > InputBar)+ ConversationDock 接线 + **移除 M3 InteractionDock 独立卡**(官方语义:挂起交互接管 composer,聊天流内不重复渲染)+ fixture:常驻审批配对在飞 bash 调用(turn 78,命令行仅对 running 调用显示)+ 稳定 question rpcId + 探针缝 rpcId 显式化 | probe-takeover **fixture 8/8 + real 8/8**(审批卡:等待条/理由/配对命令/拒绝+允许一次 → 允许一次 → 三问问题流(单选推进/多选+跳过)→ 结算 InputBar 回归;合成 plan-review 提问 → 决策卡(计划正文+三按钮) → 拒绝回执错误反馈 → resolved 离场;real 空闲回退 InputBar)+ 回归:trigger 9/9+9/9、skill 5/5、msg-actions 8/8、checklist 24/24、jobs 10/10、deliverables 6/6、attachment 8/8、m3/queue-edit 全绿 |
| **Agent 预设四表面(ui-agent-preset)** | 无 hero 预设 chip、会话头无预设标签、设置无默认预设行与预设管理分区 | vendor ui-agent-preset 整包(4 组件 + 3 控制器 + PresetMenu + locales;label surgical:官方读 byId,由 manager 快照补 ids/byId 等位后恢复官方原样)+ zion 适配(agent-preset.tsx:settings/seat/section 三控制器按官方 apply 装配、bindSnapshotSelector 绑 hook、rosterChanged 联动、list 订阅即席 apply)+ 四座位接线(hero chip/会话头标签/通用区行/设置分区)+ ui-settings 等位 SlotMap(settings.general.item/settings.section,owner 同型)+ fixture:settings.update 补 agent-presets ns、describe 补命名空间 + 深绿调色板补缺令牌(去重并修正上一轮浅色误值) | probe-preset **fixture 10/10 + real 9/9**(hero chip 菜单(标准/极简/my-agent)→ 选极简暂存 → 新建会话自动应用 → 会话头标签;通用区行选 my-agent(settings.update 往返);分区:内置/自定义组+当前使用 → 复制对话框(id 校验+创建→自定义组新卡)→ 只读查看器(组合正文)→ 删除确认;卡设默认徽标迁移;real 真实 roster(标准/PTC/极简/创造/压缩65)+ 分区与行渲染,零错误) |
| **Miller 目录浏览弹窗(ui-directory-picker-browse)** | 新建工作区走原生 host.pickDirectory,无应用内目录浏览 | vendor ui-directory-picker-browse(DirectoryBrowser 纯组件,surgical:Translate 改从 ui-slots 导入)+ zion 适配(directory-browser.tsx:listDirectory/createDirectory → wire.api.host.*,onOpen → workspace.create,失败留窗报错)+ WorkspaceMenu「+ 新建工作区」改开应用内弹窗(官方语义;原生 picker 路径退役)+ fixture 已有 browse 树(主目录/Documents 深链/懒加载子级/隐藏项) | probe-directory **fixture 9/9 + real 9/9**(弹窗+主目录单栏(隐藏项默认不可见)→ 选 Documents 双栏 → 右栏推进 → 新建文件夹(嵌套对话框,目标=选中项,创建后选中)→ 路径编辑 Enter 双栏落地 → 显示隐藏开关(.config 出现/消失)→ 打开 → workspace.create + 列表增长 → Escape 取消;real:3080 未装配 browse 能力时官方同款诚实报错面+取消) |
| **子代理目录树 + 只读 composer(ui-subagent)** | 会话头无子代理目录树;composer 对寻址子代理无只读接管 | vendor ui-subagent(SubagentCatalogAction 树 + SubagentReadOnlyComposer + locales)+ ts-types 补 dsh-subagent 占位(subagentTiming 投影 + SessionProjectionMap merge)+ zion 适配(subagent.tsx:openChild=selectSession(React 选择态同步)/refresh/setCatalogOpen 直连 manager)+ ConversationDock 会话头目录树座位(order 10)+ ComposerSeat 链加只读分支(官方 priority -10 语义:one-shot 寻址子代理/父离线未运行可继续子代理,挂在默认条之前;approval>question>只读>InputBar)+ fixture subagents.list 目录样本(Beta 可继续有下级 → Gamma 一次性叶子) | probe-subagent **fixture 6/6 + real 6/6**(目录树触发钮计数徽标 → Beta 行(可继续+展开钮)→ 展开 Gamma(一次性叶子)→ 点行打开 → 只读 composer(一次性子代理记录,无输入条)→ 回选父会话只读面消失(审批接管);real 无子代理会话官方同款隐藏动作行) |
| **cordis 插件面板增强(ui-cordis 面板语义)** | 控制台只有 Run/Update + 禁用的 stop/remove | 手写接入已有 orchestrator + remote(P3-⑪):remote 补 `stopFromPanel`/`undefineFromPanel`(官方 dynamicCordisRunner 面板级端点,3080 已实装)+ hub 补 stopRow/removeRow/setRpc(wire rpc 注入:fixture 页走内存清单,real 页同 HTTP)+ PluginHost 行增强:版本选择器(多 package)/运行(mode 随选中版本 run|update)/停止/移除/重试下一版本/回滚(过渡区)+ fixture 内存清单端点(inventory/runHostHalf/stop/undefine/getClientCode/resolveRequestRun 全链)+ 审批卡(允许/批准并信任/拒绝)既有 | probe-cordis-panel **fixture 6/6 + real 6/6**(清单行:版本选择器(2 版)+ running → 停止 → idle → 运行 → running → 移除 → 行消失+空提示;审批卡 seam 注入 → 允许 → 结算消失零错误;real:清单读取 + stopFromPanel/undefineFromPanel 对不存在插件确定性业务拒绝(plugin-missing)) |

## 2. 待补(按优先级)

### P1 — 高频/安全与首启
| 入口 | 官方源码 | zion 现状 | 补法 |
|---|---|---|---|
| 设置触发 + Settings 弹窗壳 + 分区导航(General/Models/Plugins/PluginInventory) | ui-settings-general SettingsRoot | 🟢(shell 自研;分区齐全) | — |
| 外观三 cube(浅/深/系统)/ 语言下拉 | ui-theme AppearanceRow / locale LanguageRow | 🟢(settings.mutate 往返) | — |
| 模型 Model/Effort 两级菜单(替换 `<select>`) | ui-model-selection ModelSelect | 🟢(vendor 完整) | — |
| Full access 风险确认 + 权限默认行 + composer 权限 chip | ui-permission-presets / ui-conversation PermissionSelect | 🟢(vendor;见 §1) | `/permission` 命令的 **popupSelect 装饰**随 P3 MenuView 一并接入(裸行已在命令面板) |
| Plan chip(`/plan off`) | ui-plan PlanModeControl | 🟢(vendor;见 §1) | — |

### P2 — 会话/消息生命周期
| 入口 | 官方源码 | zion 现状 | 补法 |
|---|---|---|---|
| 消息 MessageIconActions(复制/fork/时间戳) | ui-conversation chat/MessageIconActions | 🟢(vendor 接线;见 §1) | — |
| 会话行 … 菜单(重命名/fork/归档)+ 官方 Modal | ui-workspace Rows/WorkspaceBrowser | 🟢(手写;见 §1) | — |
| 工作区视图选项菜单(分组/排序)+ 官方 rename/delete Modal | ui-workspace | 🟢(侧栏视图选项两轴;顶栏 rename/delete 已有) | — |
| 会话/工作区拖拽重排 + 会话溢出展开 | ui-workspace | 🟢(手写;见 §1) | — |

### P3 — 输入/信息层
| 入口 | 官方源码 | zion 现状 | 补法 |
|---|---|---|---|
| ContextMeter / TodoPanel / StatsLine(projection 绑定) | ui-conversation skeleton / chat | 🟢(vendor 接线,useProjection 通用钩子) | — |
| PermissionSelect(composer 权限 chip) | ui-conversation skeleton | 🟢(见 §1) | — |
| QueueDock edit 行内编辑 | ui-conversation queue | 🟢(行内输入 + updateQueue edit 往返;InputBar 运行中排队发送补位) | — |
| ApprovalPanel composer 接管 / PlanReview 区分 | ui-conversation skeleton / ui-user-questions | 🟢(vendor 接线;见 §1;M3 InteractionDock 独立卡已移除) | — |
| 消息赞/踩 + 备注 | ui-message-feedback | N/A(真后端 3080 无 messageFeedback.* 远程端点,404 已探;官方接线但宿主未挂服务) | 若宿主补端点再 vendor |

### P4 — 管理/浏览面
| 入口 | 官方源码 | zion 现状 | 补法 |
|---|---|---|---|
| Agent 预设四表面(选择/copy/删除/查看/打开文档) | ui-agent-preset | 🟢(vendor 整包;见 §1) | — |
| 680×500 Miller 目录浏览弹窗(含 hidden/新建目录) | ui-directory-picker-browse | 🟢(vendor 接线;见 §1) | — |
| 子代理目录树下拉 + 展开/打开子级 + 只读 composer | ui-subagent | 🟢(vendor 接线;见 §1;右栏扁平列表保留为 zion 附加面) | — |
| skill `/` 源 + SkillRow | ui-skill | 🟡 SkillRow 已 vendor 接线(见 §1);`/` 触发源随 P2 MenuView 一并接入 | ⑥ 时 vendor |
| cordis 插件面板 run/stop/remove/版本/approve-plugin/retry-rollback | extensions/ui-cordis CordisPanel | 🟢(手写接入既有 orchestrator + remote;见 §1) | — |
| cordis define/run 卡 + Package 业务槽 | ui-cordis CordisRunRow etc. | 🟡 槽已声明;卡未 vendor(真实 cordis 工具调用经通用卡渲染;待真实工作负载出现后按需 vendor) | 后续按需 |

## 3. N/A(官方 web 未接线)
- DetailsPanel(L6):官方 `openDetails` 未调用,zion 占位即可。
- ui-layout 的 rail/折叠视觉态、theme-presenter(全局 DOM 应用)。
- 会话导出/下载按钮(官方无 UI;host-only 通道)。
- ui-directory-picker-native:renderless(OS 对话框)。
