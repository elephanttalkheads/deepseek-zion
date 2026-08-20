# DSH Web GUI UI 组件完整清单（索引）

> **本文件是唯一入口**。它把 deepseek-harness 源码里 ASHL 的全部可见 UI 组件汇总为一份可直接驱动 UI demo 生产的清单，并对 `../DSH-GUI-技术选项方案.md` §7 的 24 项功能清单做了遗漏对照。
>
> 配套的分卷盘点（每个文件就是一份"给另一个 AI 的详细组件表"）：
> - 仓库根：`D:\github-Clone\deepseek-harness`
> - 本索引与各分卷：`D:\pi-martix-ui-dev\docs\ui-inventory\`

---

## 0. 怎么用这份清单（给操作者/AI）

1. **先读本索引** —— 它给出全量组件→源码位置→渲染内容的一页式总表（§2），以及"哪些 UI 是最容易被遗漏的"（§4）。
2. **重建外壳**：读 `01-shell-core.md`(shell 内核+原子库+装载页) + `02-layout-sidebar.md`(三栏布局+侧栏+附件) + `11-theme-locale-connection.md`(token/语言/连接，含 `?fixture` 无后端跑全套的方法)。
3. **重建对话**：读 `03-conversation.md`(对话节点/输入/审批/计划条/队列/详情) + `04-tool.md`(工具卡/树) + `05-input-commands.md`(/ 与 @ 触发、命令、技能、子代理)。
4. **重建视图与设置**：读 `06-trajectory-workflow.md`(轨迹/工作流/交付物) + `07-goal-jobs-feedback.md`(Goal/任务/反馈/提问) + `08-model-permission-plan.md`(模型/权限/计划) + `09-preset-directory.md`(预设/目录选择) + `10-settings.md`(设置体系)。
5. **补 Cordis 运行时 UI**：读 `12-cordis-extensions.md`(cordis 定义/运行行 + 插件面板，位于 `packages/extensions/` 而非 `packages/client/`)。
6. 产出 demo 时**对照 §4 的"易遗漏清单"逐项自检**；连接数据可用 `?fixture` 或接真实 `/api`（见 `11-*.md`）。

---

## 1. 源码结构速览（34 个 client 包 + 1 个 extensions 包 + 外壳）

| 层 | 包（`packages/client/`） |
|---|---|
| 外壳/内核 | `web`、`web-react`、`runtime`、`modules`、`ui-slots`、`schema-form`（+ `apps/web`） |
| 布局/侧栏 | `ui-layout`、`ui-sidebar`、`ui-workspace`、`ui-attachment` |
| 对话域 | `ui-conversation`、`ui-tool`、`ui-input-trigger`、`ui-commands`、`ui-skill`、`ui-subagent` |
| 视图 | `ui-trajectory`、`ui-workflow-run`、`ui-deliverables` |
| 会话附加 | `ui-goal`、`ui-jobs`、`ui-message-feedback`、`ui-user-questions` |
| 模型/权限/计划 | `ui-model-selection`、`ui-permission-presets`、`ui-plan` |
| 预设/目录 | `ui-agent-preset`、`ui-directory-picker-browse`、`ui-directory-picker-native` |
| 设置 | `ui-settings`、`ui-settings-general`、`ui-settings-models`、`ui-settings-plugin-inventory`、`ui-settings-plugins` |
| 系统 | `ui-theme`、`locale`、`connection`、`hmr` |
| 原子库 | `ui-primitives`（34 原子 + 70 图标） |
| Cordis 扩展（`packages/extensions/`） | `ui-cordis` |

**关键机制**：所有可见 UI 都通过 **Slot 体系** 组装。`root`（运行时内置）→ `ui-layout/AppFrame`（三栏）→ `sidebar`/`conversation`/`details`/`shell.overlay` → 各业务 slot。组件拿到数据靠 web-react 的 **标准 kit**（`useSession`/`useProjection`/`useSessions`/`useWorkspaces`）+ slot owner props，不直连 Host。重建 demo 的核心是**模拟这份 props 契约 + 按 Slot 树组装**。

---

## 2. 全量 UI 组件总表（组件 → 源码位置 → 渲染内容 → 分卷）

> 位置均相对仓库根 `D:\github-Clone\deepseek-harness`；"分卷"列指向 `ui-inventory/NN-*.md`。

### 2.1 外壳与原子库（分卷 01、11）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| AppRoot 装载页/失败页 | `packages/client/web/src/AppRoot.tsx` | boot settle 前的 wordmark+spinner；失败时逐 entry 报错 |
| DocumentTitle | `packages/client/web/src/DocumentTitle.tsx` | 浏览器标题投影（副作用 UI） |
| ui-primitives 34 原子（StateDot/DisclosureRow/Button/Pill/Input/Menu/HoverCard/Modal/OnboardingSurface/RiskConfirmation/ConnectionBanner/FishLogo/BrandWordmark/Tooltip/Toast/JsonTree/TerminalBlock/ReadBlock/DiffBlock/SearchBlock/WebBlock/CodeBlock/JsonBlock/MarkdownText/MessageText…） | `packages/client/ui-primitives/src/` | 全站共享原子；markdown/diff/terminal/read/search/web 等结果块；70 个 `ic_ds_*` 图标 |
| Appearance 外观设置行（3 色块） | `packages/client/ui-theme/src/client/AppearanceRow.tsx` | 设置→通用→外观 |
| Language 语言设置行（pill+Menu） | `packages/client/locale/src/client/LanguageRow.tsx` | 设置→通用→语言 |
| （主题 token，无 UI） | `packages/client/ui-theme/src/styles/*.css` | base/design-platform(亮暗)/scrollbar/gradient-shadow-text/shiki 五张表 |
| （连接层） | `packages/client/connection/src/` | `/api` 客户端、双 WebSocket、trust 围栏、`?fixture` 假数据 |

### 2.2 布局/侧栏/工作区/附件（分卷 02）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| AppFrame | `packages/client/ui-layout/src/client/AppFrame.tsx` | 三栏外壳 + 拖拽把手 + 主题 presenter |
| SidebarRoot | `packages/client/ui-sidebar/src/client/SidebarRoot.tsx` | 侧栏：品牌行/新建会话/折叠/浏览区/底部设置 |
| WorkspaceBrowser | `packages/client/ui-workspace/src/client/WorkspaceBrowser.tsx` | 工作区分组/平铺/搜索/会话列表 + 3 对话框 |
| WorkspacePicker/PickFlow | `packages/client/ui-workspace/src/client/WorkspacePicker.tsx` | hero 空态的 workspace 拾取/添加 |
| ProjectRowItem/SessionNodeItem/SearchResultItem | `packages/client/ui-workspace/src/client/rows/Rows.tsx` | 行组件 |
| AttachmentRail | `packages/client/ui-attachment/src/AttachmentRail.tsx` | 草稿附件缩略图轨道 |
| MessageImage/ImageGallery | `packages/client/ui-attachment/src/MessageImage.tsx` | 聊天历史图片（单图/平铺） |
| ImageLightbox | `packages/client/ui-attachment/src/ImageLightbox.tsx` | 原图灯箱 |
| DropOverlay | `packages/client/ui-attachment/src/DropOverlay.tsx` | 整页拖放邀请层 |

### 2.3 对话域（分卷 03、04、05）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| ConversationRoot | `packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx` | 对话域骨架（hero→composer→session） |
| ConversationSession/Header | `…/skeleton/ConversationSession.tsx` | 会话主体 + 头（crumb/actions/utilities/tabs） |
| ChatView | `…/chat/ChatView.tsx` | 对话流 + 分页 + 底部跟随 |
| 对话节点渲染器（12 kind：user/steering/context/assistant-step/command/manual-compaction/compaction/model-retry/turn-error/turn-max-tokens/turn-tail/unknown） | `…/chat/MessageItem.tsx` + `register-node-renderers.ts` + `conversation-nodes/*.ts` | 每条消息/节点的业务气泡 |
| AssistantMarkdown/MessageIconActions/ReasoningRow/CompactionItem/ContextInjectionRow/StatsLine/TurnStatus | `…/chat/*.tsx` | 正文/操作条/思考行/压缩标记/上下文注入/统计条 |
| InputBar | `…/input/facade.ts` + `skeleton/`(InputBar) | 默认 composer：textarea/附件/权限/模型/ContextMeter/Send |
| ApprovalPanel | `…/skeleton/ApprovalPanel.tsx` | 审批接管面板（替换整个 composer） |
| ContextMeter | `…/skeleton/ContextMeter.tsx` | 上下文占用环 + breakdown |
| TodoPanel | `…/skeleton/TodoPanel.tsx` | 计划条（input.dock） |
| QueueDock | `…/queue/QueueDock.tsx` | 排队消息坞（edit/delete/steer） |
| DetailsPanel | `…/skeleton/DetailsPanel.tsx` | 工具详情右侧列（无入口，预留） |
| EmptyHero(HeroShell/WorkspaceChip) | `…/skeleton/ConversationRoot.tsx` 内 | 无会话空态 + workspace 选择 |
| ToolCallTree/ToolCall/ToolCallBranch/GenericToolCard/ToolRow/ToolDetails | `packages/client/ui-tool/src/client/` | recursive 工具树 + 通用卡 + 行 + 详情 |
| Bash/Read/Edit/Write/Grep/Glob/Web/Todo/Ask toolviews（10 key） | `packages/client/ui-tool/src/client/tool/toolviews/*.tsx` | 各业务工具可视化（terminal/diff/read/search/web/todo/ask） |
| MenuView（/ 、@ 菜单） | `packages/client/ui-input-trigger/src/client/MenuView.tsx` | 触发候选菜单（combobox） |
| PopupSelectView | `packages/client/ui-commands/src/client/PopupSelectView.tsx` | 命令 popupSelect 外壳 + 风险确认 |
| SkillRow | `packages/client/ui-skill/src/client/` | 技能工具行（tool.call.toolview key=skill） |
| SubagentCatalogAction / SubagentReadOnlyComposer | `packages/client/ui-subagent/src/client/` | 子代理目录树 + 只读 composer |

### 2.4 视图与会话附加（分卷 06、07）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| TrajectoryToolbar/Timeline/Table | `packages/client/ui-trajectory/src/client/` | 轨迹视图（conversation.view tab id=trajectory） |
| WorkflowRunPanel | `packages/client/ui-workflow-run/src/client/` | 工作流运行面板（阶段/成员） |
| ProducedFiles | `packages/client/ui-deliverables/src/client/` | 消息尾部产物行 |
| GoalBar | `packages/client/ui-goal/src/client/` | Goal 条 + 内联编辑 + /goal 命令 |
| JobListAction | `packages/client/ui-jobs/src/client/` | 会话头任务触发 + popover 列表 |
| MessageFeedbackActions | `packages/client/ui-message-feedback/src/client/` | 赞/踩 + 备注 |
| QuestionFlow / PlanReviewPanel | `packages/client/ui-user-questions/src/client/` | 用户提问卡片 + plan-review 审批卡 |

### 2.5 模型/权限/计划/预设/目录（分卷 08、09）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| /model popupSelect + composer 模型席位 | `packages/client/ui-model-selection/src/client/` | 模型/Effort 两级菜单 + 失败 Toast |
| 权限 preset（General 行 + /permission） | `packages/client/ui-permission-presets/src/client/` | 权限预设选择 + Full access 风险确认 |
| PlanModeControl（plan chip） | `packages/client/ui-plan/src/client/PlanModeControl.tsx` | 计划开关 chip |
| AgentPresetSeat/Label/Row/Section/PresetMenu | `packages/client/ui-agent-preset/src/client/` | hero chip/头 label/设置行/管理页（卡片+3 Modal）/共享菜单 |
| DirectoryBrowser（Miller 列） | `packages/client/ui-directory-picker-browse/src/client/DirectoryBrowser.tsx` | 浏览目录对话框 |
| NativeDirectoryFlow | `packages/client/ui-directory-picker-native/src/client/` | renderless（OS 对话框） |

### 2.6 设置体系（分卷 10）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| SettingsRoot（模态外壳+左导航） | `packages/client/ui-settings-general/src/client/SettingsRoot.tsx` | 设置面板主框架 |
| ModelsSection/ProviderEditor/DeepSeekModelsEditor/ModelListEditor/CustomProviderCard/Onboarding | `packages/client/ui-settings-models/src/client/*.tsx` | 模型 provider 管理、API key（credentials.set）、发现模型、onboarding |
| PluginInventorySettingsTab | `packages/client/ui-settings-plugin-inventory/src/client/` | 插件只读清单 |
| PluginsSettingsSection/ConfigurablePluginsTab/PluginCard/ValueField/SecretField + Bash/AgentLoop/WebSearch 卡 | `packages/client/ui-settings-plugins/src/client/` | 插件配置卡 |

### 2.7 Cordis 运行时 UI（分卷 12，位于 `packages/extensions/`）

| 组件 | 源码位置 | 渲染内容 |
|---|---|---|
| CordisDefineRow/CordisRunRow/CordisPanel/run-card | `packages/extensions/ui-cordis/src/client/*.tsx` | `tool.call.toolview` 的 cordis_define/run/stop/undefine 等行 + `sidebar.footer.action` 插件面板 + `tool.view.cordis` 运行卡承载 |

---

## 3. 对照《DSH-GUI-技术选项方案.md》§7：遗漏分析

> 结论：方案 §7 的 24 项功能面**在"功能域"层面无遗漏**（每个功能域都有对应源码包实现），但在**"可见 UI 组件"层面存在 8 类遗漏**——方案写的是"功能域"，而清单要求能直接改/重建每个组件。以下是被方案 §7 忽略、但实际存在于官方 Web UI 的可见组件：

| # | 遗漏的可见 UI | 官方机制/源码 | 方案 §7 对应项 | 遗漏原因 | 对 demo 的影响 |
|---|---|---|---|---|---|
| L1 | **空态 hero 整卡**（HeroGlow/WorkspaceChip 作为 Workspace 选择器） | `ui-conversation` skeleton/ConversationRoot.tsx + `ui-workspace` WorkspacePicker | #1（会话创建） | 方案把 hero 当作"背景"，未列为功能面 | 无会话首页是官方第一屏，demo 必须画 |
| L2 | **上下文占用计量环 ContextMeter + breakdown 面板** | `ui-conversation/src/client/skeleton/ContextMeter.tsx`（`contextPressure`/`contextBreakdown` projection） | #2（流式渲染） | 属于 composer 附属 UI | composer 尾部 14px 环 + 点击面板 |
| L3 | **计划条 TodoPanel**（独立于普通 plan chip，`conversation.input.dock` order 0） | `ui-conversation/src/client/skeleton/TodoPanel.tsx`（`todos` projection） | #11（计划模式） | 方案只写了 /plan chip | 输入坞上方的计划条（状态 counts+折叠列表） |
| L4 | **审批接管面板 ApprovalPanel**（替换整个 composer，非气泡） | `ui-conversation/src/client/skeleton/ApprovalPanel.tsx`（`conversation.composer` selector） | #9（审批） | 方案写成"全息确认窗"，实际是 composer 被整体接管 | 悬停审批时输入框消失换成拒绝/允许面板 |
| L5 | **排队坞 QueueDock 的完整交互**（edit/delete/steer 分级） | `ui-conversation/src/client/queue/QueueDock.tsx` | #23（队列管理） | 方案只写"排队消息编辑 UI" | edit 模式、steer 位移、180px 上限 |
| L6 | **工具详情右侧列 DetailsPanel**（含 terminal 详情、`conversation.details.tool`） | `ui-conversation/src/client/skeleton/DetailsPanel.tsx`（**暂无入口**，`openDetails` 未调用） | #7（工具卡） | 是预留 UI | 重建时可不接线（官方也未接） |
| L7 | **附件体系的 4 个原子**（AttachmentRail/DropOverlay/ImageLightbox/MessageImage）与完整上传流程 | `packages/client/ui-attachment/src/*.tsx`（paste/drop→rail→lightbox、imageLimits 前置校验） | #3（附件） | 方案只写"附件与图片限额"未列组件 | 拖放整页 overlay + 草稿缩略图轨道 + 灯箱 + 历史图 |
| L8 | **Cordis 运行时 UI（`extensions/ui-cordis`）** | `packages/extensions/ui-cordis/src/client/`（cordis_define/run/stop 行 + 插件面板 + 运行卡） | #19（插件清单） | 该包在 `packages/extensions/` 不在 `packages/client/`，易被源码扫描遗漏 | 动态插件调用卡片与运行面板 |
| L9 | **连接状态横幅 ConnectionBanner / 重连表现** | `ui-primitives/src/ConnectionBanner.tsx`（owner 订阅 connection 态）+ `connection` 双 WS 重建 | #22（连接重连） | 方案写"状态栏连接灯"，官方是顶部横幅 | 断线显示"连接已断开，正在重连…"顶部条 |
| L10 | **权限预设的 Full access 风险确认（双表面）** | `ui-permission-presets`（General 行 + /permission popupSelect 均需 RiskConfirmation 勾选） | #9 | 方案未提风险勾选交互 | danger-full-access 必须先勾选 |

> 另注：方案 §7 的"#24 无障碍"在三档体验之外，官方还有 `OnboardingSurface`（首次运行引导接管面）与 `prefers-reduced-motion` 分级，已在 L 清单与分卷 01 中体现。

---

## 4. 易遗漏清单（产出 demo 时逐项自检）

- [ ] **空态 hero**（未选会话的第一屏，workspace 选择）
- [ ] **装载页/失败页**（boot 未 ready 的加载面，失败逐 entry 报错）
- [ ] **ContextMeter 环** 与 **StatsLine 统计条**（composer.dock）
- [ ] **ApprovePanel 接管 composer** vs 普通提问卡（两类覆盖）
- [ ] **TodoPanel 计划条 + QueueDock 排队坞**（同 input.dock 的 0/20 order）
- [ ] **附件全流程**：DropOverlay 整页拖放 → AttachmentRail 缩略图 → ImageLightbox 灯箱 → MessageImage 历史图（含 imageLimits 前置拒绝）
- [ ] **工具卡折叠/展开整行 toggle**、错误行摘要替换、路径链接、Inspect 药丸、`+N` 非收缩后缀
- [ ] **命令行的结果行跨包**（触发在 ui-commands，行卡片在 ui-conversation 的 `conversation.chat.commandview`）
- [ ] **子代理目录树 + 只读 composer** 与 `@` 提及是两套 UI
- [ ] **/ 菜单是 combobox**（焦点留 textarea）而 popupSelect 持有焦点——同 overlay 两种交互
- [ ] **轨迹视图是 conversation.view 标签页**（id=trajectory），需经 TabBar 进入；数据是 projection 非纯历史
- [ ] **设置面板**：General(0)/Models(10)/Plugins(15) 三 section，Plugins 内两个 tab；语言行 order0 / 外观行 order10 同槽
- [ ] **凭证 UI**：API key 写保护密码框走 `credentials.set`，settings 段从不带 key 值；configured/missing 状态点
- [ ] **预设四表面**：hero chip / 头 label（静态）/ 设置行 / 管理页 + 复制/deletion 3 个 Modal + broken 卡
- [ ] **目录选择两态**：browse 的 Miller 列对话框 / native 的 renderless（OS 弹窗）
- [ ] **详情右侧列 DetailsPanel**（官方未接线，可不渲染）
- [ ] **Cordis 扩展 UI**（cordis_define/run 行 + 插件面板，packages/extensions/ui-cordis）
- [ ] **断线重连横幅** 与 `?fixture` 无后端跑全套的开发捷径
- [ ] **主题五张样式表**（base/design-platform 亮暗/scrollbar 双路径/gradient-shadow-text/shiki）——仅 token 不算完整主题
- [ ] **滚动条皮肤 + 语法高亮色板**（独立样式层，易漏）
- [ ] **70 个 `ic_ds_*` 图标**（可复用 SVG path，无需重画）

---

## 5. 分卷导航（每卷 = 一份详细组件表）

| 分卷 | 文件 | 覆盖包 | 可见组件数（约） |
|---|---|---|---|
| G1 | `01-shell-core.md` | apps/web, web, web-react, runtime, modules, ui-slots, ui-primitives, schema-form | 34 原子 + 70 图标 + 装载页 |
| G2 | `02-layout-sidebar.md` | ui-layout, ui-sidebar, ui-workspace, ui-attachment | 5 + 1 + 4 + 5 |
| G3 | `03-conversation.md` | ui-conversation | 12 节点 kind + 20 组件 |
| G4 | `04-tool.md` | ui-tool | 10 key / 19 组件 |
| G5 | `05-input-commands.md` | ui-input-trigger, ui-commands, ui-skill, ui-subagent | 5 |
| G6 | `06-trajectory-workflow.md` | ui-trajectory, ui-workflow-run, ui-deliverables | 5 |
| G7 | `07-goal-jobs-feedback.md` | ui-goal, ui-jobs, ui-message-feedback, ui-user-questions | 6 |
| G8 | `08-model-permission-plan.md` | ui-model-selection, ui-permission-presets, ui-plan | 8 |
| G9 | `09-preset-directory.md` | ui-agent-preset, ui-directory-picker-browse/native | 7 |
| G10 | `10-settings.md` | ui-settings-general/models/plugin-inventory/plugins | ~20 |
| G11 | `11-theme-locale-connection.md` | ui-theme, locale, connection, hmr | 2 设置行 + token 层 |
| G12 | `12-cordis-extensions.md` | extensions/ui-cordis | 5 |

---

## 6. 给 AI 重建 demo 的三条硬约束（与方案 §3 红线一致）

1. **只替换渲染层，wire 契约原样**——组件数据经标准 kit（`useSession`/`useProjection`/slot owner props）拿，不发明私有数据层，不动 Host 组合。
2. **不伪造遥测与状态**——DESIGN.md §10：展示真实事件/结果，未知标未知；能量层可抽象表达但与真实状态**加断言一致**。
3. **保留三档体验**——CINEMATIC / FOCUS / `prefers-reduced-motion` 的 REDUCED（动画终态直显、无中间帧闪现），动效不阻塞主线程。
