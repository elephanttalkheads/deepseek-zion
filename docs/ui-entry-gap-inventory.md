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
- zion `renderer/vendor` 现为 **10 包 + 类型占位**:client-connection / client-runtime /
  client-ui-conversation / client-ui-slots / client-web-react / **ui-primitives(最小面,
  含 Menu/Button/Modal/RiskConfirmation)** / **ui-trajectory(完整)** / **ui-plan(完整)** /
  **ui-permission-presets(完整)** / **schema-form(完整)** + `vendor/ts-types`
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
| **ContextMeter / StatsLine / TodoDock(projection 绑定)** | composer 缺上下文环/统计条/plan strip | runtime 增通用 `useProjection`(per-key uSES 绑定)+ 适配层三 seat(vendor 组件直接接线)+ ts-types 补 token-meter/session-stats/tool-todo 占位(含 SessionProjectionMap merge) | probe-composer-stats **fixture 6/6 + real 7/7**(真实投影:8 轮 · 25 步、缓存命中 89%、上下文已用 5%;todos=null 正确隐藏) |
| **会话行 … 菜单(重命名/分叉/归档)+ 视图选项菜单(分组/排序)** | 侧栏无行操作菜单、无分组/排序 | 手写(官方 ui-workspace 等位):行 … Menu(rename Modal / fork 省略 atSeq=最后完成回合并选中子代 / archive 无确认)+ 视图选项 Menu(groupBy workspace|flat 用 WorkspaceView.sessionIds 账目、orderBy manual|updated) | probe-workspace-actions **fixture 8/8 + real 8/8**(重命名往返、fork 子行出现并选中、archive 行实时消失;真实分组 DEEPSEEK-ZION/DSH-PLUGINS/PI-MARTIX-UI/未分组) |
| **会话/工作区拖拽重排 + 会话溢出展开** | 无拖拽、无溢出控制 | 手写(官方 DragState 等位):组内会话行拖到目标上/下半 → insertSessionBefore;工作区组头拖拽 → insertBefore;host/workspace-* 帧驱动账目自动刷新;溢出折叠 COLLAPSED_SESSION_LIMIT=5 + 「+N 个更多…」展开 | probe-sidebar-drag **fixture 6/6 + real 6/6**(3 次 fork 后组内 6 行 → 折叠 5+1 → 展开 → 拖拽到最后 → 顺序可见更新;真实分组含 >5 行组溢出按钮) |

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
| 消息 MessageIconActions(复制/fork/时间戳) | ui-conversation chat/MessageIconActions | ❌ | vendor/手写 |
| 会话行 … 菜单(重命名/fork/归档)+ 官方 Modal | ui-workspace Rows/WorkspaceBrowser | 🟢(手写;见 §1) | — |
| 工作区视图选项菜单(分组/排序)+ 官方 rename/delete Modal | ui-workspace | 🟢(侧栏视图选项两轴;顶栏 rename/delete 已有) | — |
| 会话/工作区拖拽重排 + 会话溢出展开 | ui-workspace | 🟢(手写;见 §1) | — |

### P3 — 输入/信息层
| 入口 | 官方源码 | zion 现状 | 补法 |
|---|---|---|---|
| ContextMeter / TodoPanel / StatsLine(projection 绑定) | ui-conversation skeleton / chat | 🟢(vendor 接线,useProjection 通用钩子) | — |
| PermissionSelect(composer 权限 chip) | ui-conversation skeleton | 🟢(见 §1) | — |
| QueueDock edit 行内编辑 | ui-conversation queue | 🟢(行内输入 + updateQueue edit 往返;InputBar 运行中排队发送补位) | — |
| ApprovalPanel composer 接管 / PlanReview 区分 | ui-conversation skeleton / ui-user-questions | 🟡 独立卡 | 布局改造 |
| `/` `@` 触发菜单 MenuView + popupSelect 命令弹窗 | ui-input-trigger / ui-commands | ❌ | vendor |
| 图片 Lightbox / 拖放附件覆盖层 | ui-attachment | ❌ | 手写 |
| 消息赞/踩 + 备注 | ui-message-feedback | N/A(真后端 3080 无 messageFeedback.* 远程端点,404 已探;官方接线但宿主未挂服务) | 若宿主补端点再 vendor |
| JobListAction 作业 badge | ui-jobs | 🟡 vendor 依赖待补(StateDot/useDismissOnOutsidePointer);jobsBySession 数据已有;计划见 HANDOFF §3A | vendor |
| ProducedFiles / WorkflowRun 面板 | ui-deliverables / ui-workflow-run | ❌ | vendor 节点定义 |

### P4 — 管理/浏览面
| 入口 | 官方源码 | zion 现状 | 补法 |
|---|---|---|---|
| Agent 预设四表面(选择/copy/删除/查看/打开文档) | ui-agent-preset | ❌ | vendor |
| 680×500 Miller 目录浏览弹窗(含 hidden/新建目录) | ui-directory-picker-browse | ❌ | vendor |
| 子代理目录树下拉 + 展开/打开子级 + 只读 composer | ui-subagent | 🟡 右栏扁平列表 | 部分 vendor |
| skill `/` 源 + SkillRow | ui-skill | ❌ | vendor |
| cordis 插件面板 run/stop/remove/版本/approve-plugin/retry-rollback | extensions/ui-cordis CordisPanel | 🟡 仅审批/演示 | 手写接入已有 orchestrator + remote |
| cordis define/run 卡 + Package 业务槽 | ui-cordis CordisRunRow etc. | 🟡 槽已声明 | 手写 |

## 3. N/A(官方 web 未接线)
- DetailsPanel(L6):官方 `openDetails` 未调用,zion 占位即可。
- ui-layout 的 rail/折叠视觉态、theme-presenter(全局 DOM 应用)。
- 会话导出/下载按钮(官方无 UI;host-only 通道)。
- ui-directory-picker-native:renderless(OS 对话框)。
