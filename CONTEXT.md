# DeepSeek-Zion — 复刻 dsh web UI 领域词表

本词表覆盖 **deepseek-zion**（复刻 dsh web UI 的 Electron 应用）的领域概念。
它是对 `(https://github.com/elephanttalkheads/pi-martix-ui.git)`（ZION 主工程，pi 为底座）**语境独立**的词汇表：两者的会话模型与视觉概念不同源，禁止互灌。

## 核心概念

**复刻 renderer**：
deepseek-zion 内一个自成体系的 React 18 + Vite 前端工程，把 dsh web 的 UI 组件按 UI 清单 1:1 重写。与 Electron 壳解耦、不碰 ZION 主工程的 store。官方 UI 由其 1:1 复刻，绝不直接加载官方 dist 作为实现。
_Avoid_: 皮肤层、官方 UI 原样加载

**外壳（shell）**：
Electron 层的职责：探测 `dsh --profile web --port N`、拉起/复用 dsh 进程、打开 BrowserWindow 加载复刻 renderer。只关心进程与窗口生命周期，不注入业务语义。
_Avoid_: 主进程逻辑包办会话

**会话（session）**：
与官方 dsh web 同一领域语义：后端持久化的对话上下文，左侧列表展示、可切换/新建/删除/归档。复刻 UI 的会话数据来自官方运行时（连接真实 dsh 或 fixture），不另造会话模型。
_Avoid_: 会话培育仓（那是 ZION 词表）、聊天记录

**官方运行时骨架**：
从 `@deepseek-ai/dsh-client-*` 系列 npm 包引入的数据/状态层：ConnectionController（/api POST + 双 WebSocket + 握手重连）、快照引擎、投影存储、`bindSnapshotSelector`。它承载 wire 契约与事件订阅，确保功能对等，属"可复用层"。
_Avoid_: 自研协议、二道解析

**标准 kit（standard kit）**：
官方框架在 slot 渲染时注入的 hooks/props（useSession / useProjection / useSessions / useWorkspaces）。由 ui-slots 契约 + web-react uSES 桥 + runtime 快照层三者构成。复刻组件通过 slot 机制接收，不自行 new。
_Avoid_: 组件内直接跨框架取数

**fixture**：
官方提供的 `?fixture` 假后端（FixtureApiClient，纯 TS、in-process、无真实 dsh 也可跑）。开发期默认数据源，让 UI 形状脱离后端依赖。
_Avoid_: 自造假数据脚本

**会话投影（projection）**：
主机计算的整值会话视图，客户端按 "higher seq wins" 合并，是快照引擎的输入。复刻 UI 只消费投影结果，不重算业务。
_Avoid_: 客户端拼状态

**对话节点（node kind）**：
会话 feed 中的节点类型集合（user/steering/context/assistant-step/command/manual-compaction/compaction/model-retry/turn-error/turn-max-tokens/turn-tail/unknown，及委托工具卡的 tool-call）。复刻渲染器需完整覆盖 12+1 种。
_Avoid_: 回合（turn 是 ZION 词表的近似，语义不同）、消息类型

**工具卡 key（tool.call.toolview）**：
工具视图的键控 slot：bash/read/edit/write/grep/glob/web_search/web_fetch/todo_write/ask_user_question（10 key）。每个 key 一种工具卡渲染。
_Avoid_: 工具链块（ZION 词表）、命令卡片

**对话核心闭环**：
复刻首版范围（MVP）：三栏布局 + 会话 CRUD/搜索 + 全节点渲染 + composer 状态机 + 10 工具卡 + 审批/队列/反馈/上下文计量，跑通「进会话→流式→工具→审批→结算」主轴。命令/技能/子代理/设置/凭证/主题/语言等为第二、三批。
_Avoid_: 全量一次铺开

**装配深度（B 直拼）**：
复刻 renderer 的数据层采用"纯类直拼"：直接 new 官方纯 TS 类（WebApiClient/FixtureApiClient → ConnectionController → SessionManager → Session），用 bindSnapshotSelector 把 {getSnapshot,subscribe} 绑成 hooks 透给组件。绕开 SessionRuntime/cordis 装配面，不把 renderer 变成 cordis 应用。
_Avoid_: 官方 slot 渲染面整体搬入、renderer 即 cordis 应用

**插件运行时（plugin runtime）**：
复刻 renderer 内并行存在的一个旁路"官方 client 插件"承载层：独立 `new Context()` + Loader + 代码求值器（new Function 包裹 client 源码字符串，React/console/styles/host/harness 作闭包符号）+ guard 代理 ctx + slot 机（createSlotRenderer 渲染）。它只为"社区/创造模式插件"的 client 半服务，复刻 UI 本体不走它。
_Avoid_: 复刻组件也注册进 slot、渲染机二合一

**community 插件(client 半)**：
以 cordis 插件形态编写的扩展，其前端 UI 部分经远程传送的原始 JS 源码字符串（非 HTTP bundle），用 `new Context()` 独立装载。New Context 不需要 window.__DSH_BOOT__/ClientModuleSystem（那只携带官方入口图）。
_Avoid_: 插件走 /plugins/ HTTP 构建管线

**slot 注入面（plugin 可注册槽）**：
插件 client 半经 `ctx.slots.inject(key, cb)` + `ctx.slots.register({name,...}, Component)` 注册 UI。本工程向插件开放的槽位策略（Q20A）：只开放"附加型"槽（shell.overlay / conversation.chat.assistant-actions / conversation.input.dock / tool.call.toolview 新 key / settings.plugin.item / sidebar.footer.action 等）；root/conversation/sidebar 主机位由复刻 UI 独占，插件注册到即报错。
_Avoid_: 插件抢占 root/conversation/sidebar 主体

## Rules

- 复刻范围限定在本词表；ZION 视觉语汇（数雨/培育仓/神经线缆/feed）不进入复刻 UI。
- 数据层与 wire 契约（52 RPC + respond + 双 WS + session.export）零改动，只做消费。
- 会话语义不变：不伪造遥测，只展示官方运行时给出的真实事件/投影/结果。
- 插件运行时从 M1 起作为底座第一公民；复刻组件保持普通 React（Q19A），插件只走附加型槽（Q20A）。社区插件 host 半在真实 dsh 进程跑，client 半源码经 remote 取码。
