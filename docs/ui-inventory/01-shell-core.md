# G1 外壳与核心盘点

范围：`apps/web`（Vite 入口外壳）、`packages/client/web`（Web shell 库）、`web-react`、`runtime`、`modules`、`ui-slots`、`ui-primitives`、`schema-form`。
目标：为重建 UI demo 提供不遗漏任何可见 UI 组件的精确清单；纯机制也列出并注明"机制，无可见 UI"。

> 说明：本文件覆盖外壳与核心基础设施（shell 内核、slot 系统、原子组件库、运行时内核）。领域可视化 UI（sidebar/conversation/layout/parameters 等）属于后续 `ui-*` 包盘点，不在此文件。`apps/web` 的 `tests/`（e2e/snapshot）为测试驱动代码，不承载可见 UI，仅入口 `main.ts` + `index.html` 计入外壳。

---

## 包：apps/web（外壳入口）

作用：Vite 入口外壳——一个薄引导层。`main.ts` 找到 `#root` 挂载点并运行 `AppWebEntry`（真正的 boot 逻辑全在 `@deepseek-ai/dsh-client-web`）；`index.html` 提供 HTML 外壳、PWA manifest、图标、页标题。该包本身几乎不承载可见渲染，真正 UI 由 shell 库 + 插件树产出。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| index.html | HTML 骨架：`#root` 挂载点、`<title>DeepSeek Harness</title>`、viewport、manifest/favicon 链接 | 静态 | 无 | 外壳的 DOM 锚点；lang="zh-CN" |
| src/main.ts | 无（仅引导）——`document.getElementById('root')` 后 `new AppWebEntry(el).run()` | `#root` DOM | 无 | 所有 boot 逻辑委托给 `@deepseek-ai/dsh-client-web` 的 `AppWebEntry` |
| src/node-module-stub.ts | 无（构建桩） | — | 无 | 机制，无可见 UI |
| vite.config.ts | 无（构建配置：alias、externals 投影） | — | 无 | 机制，无可见 UI；引用 `PLATFORM_MODULES` |
| tests/*（assembled-boot.ts, scaffold.ts 等） | e2e/snapshot 测试驱动 | — | 无（组装时可 import `AppWebEntry` boot 真 shell） | 机制，无可见 UI；不在可见组件盘点范围 |

---

## 包：packages/client/web（Web shell 库）

作用：`@deepseek-ai/dsh-client-web`——Web shell 内核。`AppWebEntry` 通过两阶段 boot（web2）挂载整个客户端：模块面（在 `window.__DSH_BOOT__` 之上构建客户端模块系统 + 预取 `immediately` 层）→ 插件面（挂载 vendored cordis Loader，注入模块系统为 `internal`，为每个 graph 行 + app-shell 组装行创建 loader entry，等到 settle 后一次性切换到真实 UI）。装载页（boot loading page）与失败报告是 shell 自带可 UI。浏览器标题投影也在此包。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| src/AppRoot.tsx（AppRoot） | **装载页 UI**：boot settle 前显示 HARNESS wordmark + spinner + "Loading plugins…"；失败时显示"Failed to load plugins" + 逐 entry 失败列表 + 错误信息；settle 后切换到 real UI | 内核信号 `settled/status/error`（useSyncExternalStore）+ 逐 entry fiber 状态投影；`renderApp()` 工厂由 app-shell 提供 | 无（内核组件，zero 插件依赖） | 唯一一次从装载页 → 真实 UI 的开关点；fail-loud |
| src/boot.tsx（AppWebEntry） | 无渲染（类）；驱动装载页状态机 | `window.__DSH_BOOT__` manifest、`internal/status` fiber 事件、loader entry | 创建 loader entry、注入 `internal`、registerStatic 模块、sweep | 机制，无独立可见 UI（其状态投影驱动 AppRoot） |
| src/app-shell.ts（apply） | 无渲染；提供 `appShell` 服务，`renderApp()` 懒构建真实 UI 树；也是 `createSlotRenderer()` 安装点 | `ctx`（slots/sessions/layout 注入） | 安装 slot renderer；提供 `ctx.appShell` | 伪 entry（无 npm 包）；官方 slot 安装点在 boot 后 |
| src/app.tsx（buildRenderApp） | **真实 UI 树的组装闭包**：`<SessionDocumentTitle/>` + `ctx.slots.renderSlot('root', {})` | session list 投影（`useSessions` 取 current title）+ slot 目录 | 调用 `renderSlot('root')`——程序里**唯一**的 ctx 级 renderSlot | 整个布局树挂在 'root' slot 上（由 ui-layout 注册 AppFrame） |
| src/DocumentTitle.tsx（DocumentTitle + SessionDocumentTitle） | 无可见元素（返回 null）：将选中会话标题投影到 `document.title`（`<title> — <product>`），卸载恢复 | 选中 session 的 durable title（`useSessions`） | 机制（副作用式 UI，改浏览器标题） | 无会话/未命名会话时保留原标题 |
| src/loader-status.ts | 无渲染：fiber-state 词汇 + 手写 kernel 状态 store（usES 兼容 getSnapshot/subscribe） | `FIBER_STATE`/`STATE_LABELS` | 机制 | 内核自持信号；因 shell 自足规则不 import 插件包 |
| src/seed.ts（getStaticModules）+ src/platform.ts（PLATFORM_MODULES） | 无渲染：平台单例模块表（react/react-dom/cordis/ui-* 种子词） | 静态 import | 机制 | 是 tsdown external + Vite alias 的唯一来源 |
| src/index.ts | 库入口 re-export | — | 机制 | 导出 AppWebEntry、AppRoot 等 |

---

## 包：packages/client/web-react（React slot 渲染机）

作用：`@deepseek-ai/dsh-client-web-react`——shell 侧 React 胶水：`createSlotRenderer`（web-react 对 SlotRenderer 接口的实现，slot terminal 设计）、`SessionProvider`、`bindSnapshotSelector`（客户端栈里唯一 hook 构造器）、`useInvoke`。`renderSlot`/`renderSlotChain` 按 entry 缓存。执行时按 chain 顺序运行注册 selector，只挂载被选中的 entry 并把 `select` 返回值注入为 `matched` prop。这些组件多数是"渲染机内部"，不直接对应最终可见元素，但 `SlotOutlet`/`SlotErrorBoundary` 的产出直接决定可见树。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| src/scoped-slots.tsx（createSlotRenderer → SlotOutlet） | **slot 出口锚点**：每个 `renderSlot` 站点包裹 `<div data-slot="<key>" style="display:contents">`，内部按 kind 派发（single/keyed/list/chain）渲染经 shadowing 选出的 winner entry；chain 运行 select 选举；fallback/crash-face 也在锚点内 | `host.subscribe/getVersion/entriesOf/entriesOfSlot/specOf`（slot 目录）+ locale revision + session provideInfo | 实现 `SlotRenderer.renderRoot`；经 `ctx.slots.install()` 安装 | 锚点是动态样式（$[data-slot]）可达的可寻址接缝 |
| src/scoped-slots.tsx（SlotErrorBoundary） | 逐 entry 错误边界：entry 崩溃渲染 `<div data-slot-error="<key>"/>`，不拖垮兄弟；shadowing kind 崩溃会 abdicate（让位给 cell 的下一个幸存者） | componentDidCatch + `host.reportEntryError` | 机制（可见为 crash-face） | chain 崩溃不 abdicate |
| src/scoped-slots.tsx（SessionMaybeEntry / SessionEntry / RootEntry / StrictSessionEntry） | entry 组件 + 四份 props（standard kit + cached inject + slot inject + owner props）组合渲染 | `standardKit`（useSessions/useWorkspaces/useSession/useProjection/sessionId/store/renderSlot/t/actions/SessionProvider） | 机制（如何把 props 合成给 slot 组件） | session-maybe 采用"adoption"语义：空白 shell DOM 在一个 session 出现时保留 |
| src/scoped-slots.tsx（ContextualEntry） | 绑定 slot 级 inject.hooks 工厂为 use* hooks 注入 | hookContext | 机制 | |
| src/session-provider.tsx（SessionProvider / SessionMaybeProvider + HostContext/BindingContext） | React Context 提供者；`SessionProvider` 是 render-prop（`children(sessionId)`），按 `key=sessionId` remount | `host.sessions.provideInfo`（useSessions 绑定） | 框架座位 | 声明 session-scope 子 slot 的 entry 会收到 SessionProvider 作为标准座位 |
| src/session-provider.tsx（observableHook/maybeObservableHook/projectionHook/useHost） | 无渲染：把 bare observable source 绑成 use<Name> selector hook（按 source 缓存）；useProjection 框架座位 | host sources + SessionMaybeProvideInfo | 机制 | Some hooks 无 session 时返回 undefined |
| src/bind.ts（bindSnapshotSelector） | 无渲染：uSES（with-selector）桥 | bare source | 机制 | 唯一 hook 构造器 |
| src/use-invoke.ts（useInvoke） | 无渲染：把 async action 包成稳定 invoke + pending flag（外部 store 跟踪 inflight） | useRef cell + useSyncExternalStore | 机制 | 无 setState 副作用 |

---

## 包：packages/client/runtime（客户端运行时/内核）

作用：`@deepseek-ai/dsh-client-runtime`——client cordis boot 与 React-free 对象服务：`SlotRegistry`（SlotCore 之上提供 cordis service 层）、`SessionRuntime`（Session 对象/列表/scope 状态/事件窗/历史分页）、`WorkspaceRuntime`（Workspace 对象/列表/默认目标/New Session 空白复用）。运行时把共享 host 流扇出为 Session/Workspace owner，并把 generic `host/remote-event` 帧交给 `ctx.remote.$dispatch`。`client/index.ts` 是插件入口（`apply`），`inject = ['connection','typert','remote','remote.commands']`。本包几乎全部是"机制，无可见 UI"——但它定义了可见 UI 依赖的数据契约与标准 kit 类型，且是唯一声明 `'root'` slot 的包。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| src/client/index.ts（apply） | 无渲染：mount SlotRegistry/SessionRuntime/WorkspaceRuntime，start connection stream loop，注册 `agent` typert context，桥接 remote 帧 | `ctx.connection/typert/remote/remote.commands` | 声明 `'root'`：`{kind:'single';scope:'root'}`；provide `ctx.slots/sessions/workspaces`；声明 `'slots/changed'`/`'connection/reset'` 事件 | 机制，无可见 UI |
| src/client/slots.ts（SlotRegistry） | 无渲染：SlotCore 的 cordis service 层——`register`（经调用者 fiber effect 收集）、`ctx.slots.inject` 声明注入、renderer 安装、store 实例轴、hostFace 构建 | ctx + SlotCore | 提供 `ctx.slots` 服务；`renderSlot('root')` 的 gate | 机制；定义 `RootOwnerProps`（owner 传 `{}`） |
| src/client/sessions/*（SessionRuntime, Session, manager, service, provide, projection-store, conversation-assembler 等） | 无渲染：Session 生命周期、list/scope、事件窗、conversation 组装、projection value store | remote/connection 帧 | 提供 `ctx.sessions`；`sessions.provide` 贡献标准 kit（`useSession`/`useProjection`） | 机制，无可见 UI；定义了 `SessionStandardProps`/`GlobalStandardProps` 类型 |
| src/client/workspaces/*（WorkspaceRuntime 等） | 无渲染：Workspace 列表/动作/默认目标派生 | remote 帧 | 提供 `ctx.workspaces` | 机制，无可见 UI |
| src/client/conversation/* | 无渲染：Conversation Definition/View 注册表（业务节点定义） | — | 机制 | 给 ui-conversation 等注册业务 Definition |
| src/client/contract/*, src/client/agents/scope.ts, time-zone.ts 等 | 无渲染：契约类型 + scope | — | 机制 | |

---

## 包：packages/client/modules（客户端模块系统）

作用：`@deepseek-ai/dsh-client-modules`——浏览器对照 Node 内部 ESM loader 的懒 CJS 表。web shell 挂载 vendored cordis Loader 并把本包注入其 `internal` 契约。执行插件 bundle 只 REGISTER factory（`window.__ModuleLoader__.load`）；模块体副作用（含 CSS 注入）在 materialization 时执行。`parseBootManifest` 解析 `window.__DSH_BOOT__` 为两个消费视图。`./client` 插件 face 把内核构建的模块系统提供为 `ctx.modules`。**全部为机制，无可见 UI**——但 CSS 注入是插件 UI 样式到达页面的通道，需在盘点中记录。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| src/client/system.ts（ClientModuleSystem） | 无渲染：惰性 CJS 表、materialization、require 分支序、静态注册、invalidate | `__DSH_BOOT__` + staticModules | 机制 | CSS 注入副作用经 materialization 到达页面；HMR 无效化钩子 |
| src/client/manifest.ts（parseBootManifest/BootManifest） | 无渲染：`window.__DSH_BOOT__` 扫描与解析（rev/url 校验），拆分 modules/plugins 两视图 | wire-boundary `window.__DSH_BOOT__` | 机制，无可见 UI | 缺失/畸形 graph 抛错 → 装载页 loud failure |
| src/client/index.ts（apply） | 无渲染：把内核 slot `window.__DSH_MODULES__` 提供为 `ctx.modules` | kernel slot | 机制 | 图行 id = 裸包名；缺失即 boot 顺序 bug |
| src/index.ts / invariant.ts | 无渲染（host 服务组合侧 / 断言） | — | 机制 | |

---

## 包：packages/client/ui-slots（slot 纯核 + 类型）

作用：`@deepseek-ai/dsh-client-ui-slots`——slot registry 纯核、slot terminal 设计：`SlotMap` 声明合并、`SlotCore.register` 单一组成 API、四份 props 类型族、store seat 类型族、renderer 安装契约。React-free / cordis-free（仅类型）。`SlotCore` 在构造时 seed 了 a-priori `'root'` slot。本包不渲染任何 UI——它是类型/注册契约层；可见 UI 由 web-react 渲染机 + ui-* 插件产生。因此**全部为机制，无可见 UI**，但它是重建 UI 时理解 slot 树如何组成的关键。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| src/index.ts（SlotCore） | 无渲染：register 负载时校验、entries/entriesOfSlot/spec、snapshot 导出、shadowing、declaration epoch、unload 级联 | 无 | 定义 `SlotMap`/`SlotEntryDef`/四份 props 类型/`LocaleNamespaceMap`；seed `'root'` | 机制，无可见 UI |
| src/renderer.ts | 无渲染：`SlotRenderer`/`SlotRendererHost`/`HostObservable`/`LocaleFace`/`SessionProvideInfo` 契约 + 错误类 | 无 | 安装契约 | 机制，无可见 UI |
| src/store.ts | 无渲染：`defineStore` 契约、`StoreHandle`/`PropsStore`/`BakedActions` 类型 | 无 | store seat 类型 | 机制，无可见 UI |

---

## 包：packages/client/ui-primitives（共享原子组件库）

作用：`@deepseek-ai/dsh-client-ui-primitives`——纯 React 原子（zero cordis），仅用 `--dsw-*` token 样式。这是外壳核心中最具可渲染可见 UI 的包：控制原语（按钮/输入/菜单/弹窗）、状态点、可折叠行、toast、onboarding 接管面、markdown 家族、JSON 树检查器、终端/diff/read/search/web 结果块、品牌资产（fish 标志、wordmark）、70 个 `ic_ds_*` 图标。它们不通过 slot 注册；数据皆经 props（label props 承载本地化，因为原子拿不到 `ctx.locale`）。

### 可见组件

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| StateDot | 会话状态指示点：done/warning/error=10x10 halo+6x6 核心；ongoing=3x3 追光动画（8 外格顺时针） | props.state（4 色语义） | props | 使用的状态与 TerminalBlock 状态槽联动 |
| DisclosureRow | 24px 可折叠航标 + 标题 + 可选预览 chevron/折叠内容/展开内容 | props（controlled open/expandable/onToggle） | props | 是占位/行折叠的共享 chrome |
| Button | token 表单按钮：primary/ghost/outline/toolbar 变体，md(36px)/sm(28px)，可带前导 icon | props | props | 无设计源的自主原子 |
| Pill | 胶囊标签（自战原子，被 sidebar 搜索/标签 strip 参考，非组件来源） | props | props | |
| Input | 输入框原子（自战原子） | props | props | |
| Menu | 受控下拉：纯 CSS 定位或 `portal`（body 固定定位）；条目含 separator/label/danger、嵌套 submenu、12px 视口清空 | props（open/items/onSelect/anchor） | props | 用于分组选择器、项目选择器 |
| HoverCard | 悬停卡片：pointer-leave 宽限保持 portaled 预览可达；可选 `copyText` 使卡片变按钮语义并写入剪贴板（copyLabel/copiedLabel） | props | props | 支持键盘触发 |
| Modal | 受控全视口对话框：mask(blur) + 居中 dialog body-portal；title/description/children/footer/close；Escape 或遮罩关闭；`headless` 模式 | props（open/title/onClose…） | props | create-workspace 等使用 |
| OnboardingSurface | 首次运行接管面：body-portal 全视口 mask + 不透明 stage，`#root` inert 仅在其自身存活期内 | props.children | props | 一屏一步 |
| RiskConfirmation | 风险确认面板（危险操作二次确认） | props | props | |
| ConnectionBanner | 断线重连横幅（顶部条）；`reconnecting=false` 时渲染 null | props.reconnecting（owner 订阅连接态）+ label | props | 默认文案"连接已断开，正在重连…" |
| FishLogo | DeepSeek fish 标志 SVG（figma 精确摘取） | props(size) | 品牌 | aria-hidden 装饰 |
| BrandWordmark | 完整品牌字标：whale + "deepseek-official" 字形 + HARNESS 徽章在单一 svg | props(size) | 品牌 | 182:24 native |
| Tooltip | 提示气泡（可选侧/位置） | props | props | |
| Toast | 瞬态顶部横幅：滑入→全透 3s→淡出 1s→onDone；body-portal、pointer-events:none、可选 anchor 居中、可选 icon | props（text/icon/anchor/onDone） | props | `role="alert"`；reduced-motion 降级 |
| JsonTree | 只读、token 主题、键盘可达 JSON 检查器：可展开/折叠树（preview 截断）、行悬停 copy 按钮 + 右键菜单（copy value/json/path/prettyJson/compactJson） | props.data（解析后 JSON）+ labels | props | `role=tree`；固定顶部展开可选 |
| TerminalBlock | 终端面：每行命令一个 prompt 行（首行短 cwd），命令输出，非零退出/终止信号 pill，copy 控件；运行中 StateDot | props.command/output/cwd/exit/… | props | ANSI 用 anser 解析，光标回放；触达 StateDot 的 running/error/done 状态 |
| ReadBlock | 带行号 + 语法高亮（shiki）的文件窗口：粗体路径/标题 banner + copy，头/尾分块 + 展开按钮、"showing N of M" | props（文件行数据） | props | |
| DiffBlock | 内联 diff 面：每文件粗体路径头，删行(错误 token)在上、增行(成功 token)在下、`⋯` gap、`└ +A -R · N file(s)` 页脚；copy 前缀文本 | props（hunks） | props | create 无 removed 侧 |
| SearchBlock | 搜索结果显示：grep（每文件粗体路径头 + lineNumber:line，组内可折叠）/ glob（扁平路径列表）；高度截断条 + 折叠汇总 + copy | props.kind 判别 | props | 不 soft-wrap，横向滚动 |
| WebBlock | 网页检索结果：search（provider answer + 有序引用列表，安全外链标题/hostname/URL 回退 + snippet/日期，固定高度滚动容器）/ fetch（紧凑最终 URL + HTTP 状态） | props.kind 判别 | props | 无 answer 时显式空态 |
| CodeBlock | 语法高亮代码块 + copy（shiki） | props | props | ReadBlock 同高亮路径 |
| JsonBlock | 可折叠 JSON 块：toggle 按钮(`▾/▸ label`)，打开时 `<pre>` pretty JSON，超 20k 字符截断 + 截断页脚 | props.label/payload | props | payload 任意 JSON |
| MarkdownText | GFM + `$…$`/`$$…$$` TeX 渲染（KaTeX，可信命令禁用）；GFM/markdown 安全净化（去 HTML、中性化相对/危险链接、http(s) 图片无 referrer）；增量流式解析（尾部重解析） | props（assistant 输出文本） | props | 来自不可信输出，安全净化；`codeLabels`/`fileMentions` 标签 props |
| MessageText | 用户/steering 内容的字面文本原语 | props.text | props | 普通 div，不做 markdown |
| JsonBlock / markdown/katex.tsx 等 | markdown 渲染的支撑（KaTeX 包装、micromark 解析、增量 AST、CJK 强力强调） | — | 支持模块 | 机制支撑，非独立可见组件 |

### 图标（70 个 `ic_ds_*`，icons/index.tsx）

全部 `fill="currentColor"`、`{size, className}`。重建 demo 时直接复用这些绘制好的 SVG path。单个列表（每个都是可见 UI 元素），含 batch A（deepsuite 库同源）+ batch B（harness-only figma 摘取）：

`IconNewChatOutline16, IconSearchOutline16, IconGlobeOutline14, IconSettingsOutline14, IconSettingsOutline16, IconPanelLeftOutline16, IconEllipsisOutline16, IconPlusOutline16, IconCheckOutline16, IconCheckOutline14, IconBranchOutline16, IconChevronDownOutline14, IconChevronLeftOutline14, IconChevronRightOutline14, IconTriangleRightFill14, IconChevronUpOutline14, IconCloseOutline16, IconCloseFill14, IconCopyOutline16, IconRefreshOutline16, IconRefreshOutline14, IconLikeOutline16, IconLikeFill16, IconDislikeOutline16, IconDislikeFill16, IconShareOutline16, IconEditOutline16, IconThinkOutline14, IconThinkOutline16, IconAgentPresetOutline16, IconBrowseOutline16, IconLinkOutline14, IconLinkOutline16, IconRightUpOutline14, IconRightUpOutline16, IconEnhanceOutline16, IconTrashOutline16, IconWarningOutline16, IconUserOutline16, IconSendOutline16, IconStopFill16, IconPaperclipOutline16, IconLoadingOutline16, IconDownloadOutline16, IconPlayOutline16, IconPauseOutline16, IconFullscreenOutline16, IconCodeOutline16, IconCordisPluginOutline14, IconApiOutline14, IconPersonalizationOutline16, IconProjectAddOutline16, IconFolderOpenOutline16, IconFolderOpen16, IconFolderClose16, IconTreeCorner8x10, IconLightOutline16, IconDarkOutline16, IconFollowsystemOutline16, IconDataOutline16, IconSendOutline14, IconQueueOutline14, IconChecklistOutline14, IconListPenOutline16, IconGoalOutline16, IconSparkle16, IconInspectOutline12, IconSkillOutline16, IconQuestionOutline14, IconArchiveOutline20`

### 支撑/副作用模块（机制，无可见 UI）

| 文件 | 说明 |
|---|---|
| useAnchoredMaxHeight / useDismissOnOutsidePointer / pointer-grace / use-copy-feedback / head-tail-cap / clipboard / ansi | hooks 与工具：底端锚最大高度钳制、外点关闭、指针宽限、复制反馈、头尾截断、剪贴板、ANSI 解析 |
| markdown/highlight, incremental, parse, render, plain-text, mathCompatibility, cjkFriendlyStrong, katex | markdown 渲染支撑 |

---

## 包：packages/client/schema-form（schema/draft 模型层）

作用：`@deepseek-ai/dsh-client-schema-form`——设置编辑器的 schema/draft 模型层。`rehydrateSchema` 把 `settings.describe` 的序列化 schemastery schema 还原为 live validator；`setPath`/`deletePath`/`hasPath`/`nodeAtPath`/`validateDraft` 支撑配置编辑。本包不拥有 React，也不渲染任何控件（Models 页在自己的卡片里手写控件的字段探测基于这里）。**全部为机制，无可见 UI**——但它定义了设置编辑器 UI 背后的数据契约。

组件：

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| src/model.ts（rehydrateSchema/setPath/deletePath/hasPath/nodeAtPath/validateDraft/getPath） | 无渲染 | `settings.describe` schema 包络（wire）+ draft 对象 | 机制，无可见 UI | 无 generic 渲染器；consumers 建特性表单 |

---

## 汇总观察（可能被遗漏但重要）

1. **可见 UI 分布在两个层面**：真实页面 UI 几乎全部由 `root` slot 上的 `ui-layout` AppFrame 及其声明的子 slot（sidebar/conversation/details/shell.overlay 等，属后续 `ui-*` 包）产出；本 G1 直接贡献的**可见组件**集中在 `ui-primitives`（约 34 个原子组件 + 70 个图标 + 5 个品牌/markdown/代码块族）与 shell 的 **AppRoot 装载页/失败页**。重建 demo 时应把这些视为"可复用原子库"，页面布局需靠后续 ui-layout/ui-conversation 盘点。
2. **装载页与失败页是 shell 自持 UI**，零插件依赖（内核信号驱动），失败时逐 entry 报告——重建时应保留这一个 fail-loud 状态面。
3. **浏览器标题投影**（DocumentTitle）是副作用 UI，改 `document.title`，易被遗漏。
4. **slot 系统的 `data-slot`/`data-slot-error` 锚点**以及 `display:contents` wrapper 是动态样式定位/接缝寻址的基础，虽无可见内容但影响 demo 的 DOM 结构与样式钩子。
5. **CSS 注入通道**：插件 bundle 的样式在 `modules` 的 materialization 时经 `<style data-plugin>` 注入——重建 demo 若想还原真实样式，需要对应这套 token（`--dsw-*`）体系，而 token 本身在 `ui-theme` 包（后续盘点）。
6. **web-react 的 `SessionProvider` / `useProjection` / `useSessions` / `useWorkspaces` / `useSession` 标准 kit**：是所有 slot 组件拿数据的唯一通道；demo 重建需模拟这份 props 契约（runtime 合并了 `SessionStandardProps`/`GlobalStandardProps` 类型）。
