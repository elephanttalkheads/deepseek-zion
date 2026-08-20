# UI 组件完整盘点 11：ui-theme / locale / connection / hmr

> 目标：为另一个 AI 重建 UI demo 提供精确清单，不遗漏任何可见 UI 组件与关键机制。
> 范围：`packages/client/ui-theme`（主题系统）、`packages/client/locale`（多语言）、`packages/client/connection`（浏览器连接层）、`packages/client/hmr`（客户端热更新）。
> 库根：`D:\github-Clone\deepseek-harness`。源码均在 `src/client`（浏览器半边）与 `src`（宿主半边）。
> 说明：connection 与 hmr **无可见 UI**，但影响 GUI 行为与重建方式，故一并记录。

---

## 一、ui-theme —— 主题系统

主题是"token 样式表 + 偏好设置 + 外观设置行"三位一体。主题本身不摸 DOM，`ui-layout` 的 presenter 负责把解析后的快照写到 `html { color-scheme }`、`body[data-ds-dark-theme]` 与内联别名 token。

| 组件/文件 | 渲染内容/作用 | 数据源 | Slot/机制 | 备注 |
| --- | --- | --- | --- | --- |
| `src/client/AppearanceRow.tsx` | **可见 UI：外观设置行**。标题"外观" + 三块可点选的"偏好色块"（浅色/深色/跟随系统），每块为图标+文案，选中态有描边/填充高亮，`aria-pressed` 标记选中 | `settings.theme` 文案 + 主题服务偏好快照（经 slot store 镜像） | 注册进 `settings.general.item` 槽（id=`appearance`，order=10）；图标来自 `ui-primitives`（`IconLightOutline16`/`IconDarkOutline16`/`IconFollowsystemOutline16`） | figma 'Frame 2117131228'。**选择态读持久化 preference，非解析后的 active 主题** |
| `src/client/AppearanceRow.module.css` | 外观行的样式：纵向 group（gap8/pad16 0/底边框 hairline）、标题、色块（flex 180px 圆角 16、hover/selected 态） | token `--dsw-alias-*` | —— | 选中态用静态 token `--dsw-static-neutral-bluish-400`（无别名名） |
| `src/client/settings-store.ts` | Appearance 行 slot store：镜像主题服务快照 `{preference, revision}`，唯一写者是 apply 层的 change 监听 | 主题服务 `theme/change` | `defineStore`（ui-runtime） | revision 防重 |
| `src/client/index.ts` | **服务提供者**：`ThemeRuntime`（`ctx.theme`）+ 注册 Appearance 行 + 注册 `settings.theme` 字典 | —— | 提供 `theme` 服务；`theme/change` 事件；`settings.general.item` 槽；注入 `slots/locale/connection/remote/settingsScope` | 三个内建主题：`light`、`dark`（`system` 是偏好不是可注册主题）；`overrideTokens` 是动态包扩展点 |
| `src/client/locales.ts` | `settings.theme` 命名空间字典：zh={外观/浅色/深色/跟随系统}，en={Appearance/Light/Dark/System} | —— | locale 命名空间 `settings.theme` | zh 为键集真源，en 编译期校验补全 |
| `src/client/index.ts` ThemeRuntime | 主题运行时：持有偏好、解析 `system`→亮/暗（`prefers-color-scheme`）、`setTheme(id)` 唯一偏好写入入口、`register()` 注册第三方主题、`overrideTokens()` 叠层、`getTheme()` 读不可变快照 | `prefers-color-scheme` media query + Host settings 持久化偏好 | 服务 + `theme/change` 事件；监听 settings scope 变更与 OS 色系翻转 | 快照不可变（`Object.freeze`），revision 单调递增 |
| `src/theme-settings.ts` | 主题偏好 schema 与常量：`THEME_PREFERENCES=['light','dark','system']`，`THEME_SETTINGS_NAMESPACE='ui-theme'`，字段 `preference`，默认 `system` | —— | 持久化到 `$DSH_HOME/settings.yaml` 的 `ui-theme.preference` | 远程浏览器只能进程内选择（settings API 仅 loopback） |
| `src/boot-theme.ts` | Host 在 `<body>` 后注入内联脚本：插件激活前先按持久化偏好解析亮/暗，提前设置 `color-scheme` 与 `data-ds-dark-theme`，避免闪屏 | Host 注册的 `ui-theme.preference` 设置值 | Host `webServer.tapIndex` 变换 | `system` 在浏览器端解析；无 HTTP server 时无影响 |
| `src/index.ts`（Host 注册） | 注册 `ui-theme` 设置 section schema + 注入 boot theme | `settings`/`webServer` 可选服务 | `ctx.inject(['settings'])`、`ctx.inject(['webServer'])` | —— |
| `src/styles/base.css` | 基础变量：字体族（sans/code）、缓动曲线、过渡时长 token | —— | 被 web shell 的 `base.css` 引入 | —— |
| `src/styles/design-platform.css` | **核心 token 表**：`--dsw-static-*`（静态色板）+ `--dsw-alias-*`（语义别名层），分 `body` 与 `body[data-ds-dark-theme]` 两套；含字体/背景/边框/按钮/交互/文本/状态/滚动条/sidebar 等大量 token | —— | token 层 | 亮暗两套完整定义 |
| `src/styles/scrollbar.css` | 滚动条皮肤：`--dsh-scrollbar-thumb{,-hover}` 绑定到 l1 滚动条 token；`scrollbar-width/color`（Firefox）与 `::-webkit-scrollbar*`（WebKit）两条互斥路径 | `--dsw-alias-scrollbar-*` token | —— | 高亮浮层可在自身容器 rebind 到 l2 对；**重建 demo 时易漏** |
| `src/styles/gradient-shadow-text.css` | 渐变/阴影 token（`--dsw-shadow-lv1..3`、`--dsw-linear-gradient-think`）+ 整套 markdown/正文/小号字体 token（`--dsw-font-*`，h1..h4、base、code、xl/l/m/s/xs/xxs/xxxs） | —— | token 层 | 亮暗渐变不同 |
| `src/styles/shiki.css` | 语法高亮 token 调色板：`--shiki-token-*`（constant/string/comment/keyword/parameter/function/string-expression/punctuation/link），亮暗两套 | —— | 供 ui-primitives CodeBlock 的 css-variables shiki 主题 | 背景/前景别名到 markdown code-block token |

---

## 二、locale —— 多语言字典

提供 `LocaleRuntime`（`ctx.locale`）与全局翻译机制（`t` 座），并注册"语言设置行"。支持语言：**zh（中文）、en（English）**，无更多。

| 组件/文件 | 渲染内容/作用 | 数据源 | Slot/机制 | 备注 |
| --- | --- | --- | --- | --- |
| `src/client/LanguageRow.tsx` | **可见 UI：语言设置行**。标题"语言" + 右侧选择器 pill（显示当前语言 + chevron 图标），点击弹 `Menu`（ui-primitives）选择 中文/English，`align="end"` + `portal` | `settings.locale` 文案 + locale 服务快照 `{active, options}`（经 slot store 镜像） | 注册进 `settings.general.item` 槽（id=`language`，order=0，在 Appearance 前）；翻译 `t('language.title')` | figma 'Setting-Cell'；状态用 React `useState`（open）；`aria-haspopup/aria-expanded` |
| `src/client/LanguageRow.module.css` | 语言行样式：横向 flex（gap8/pad16 0/底边框）、选择器 pill（h36 r18、填充 `--dsw-alias-bg-module-platform`、chevron） | token `--dsw-alias-*` | —— | —— |
| `src/client/settings-store.ts` | Language 行 slot store：镜像 `{active, options[], revision}` | locale 服务 `locale/change` | `defineStore`（ui-runtime） | revision 防重 |
| `src/client/index.ts` | **服务提供者**：`LocaleRuntime`（`ctx.locale`）+ 注册 `common`、`settings.locale` 字典 + 注册 Language 行 + `slots.installLocale(locale)` 使 `t` 座可用 | —— | 提供 `locale` 服务；`locale/change` 事件；`settings.general.item` 槽；注入 `slots/connection/remote/settingsScope` | `LocaleRuntime` 即 LocaleFace（bind + getSnapshot/subscribe） |
| `src/client/index.ts` LocaleRuntime | 字典注册表 + 语言偏好。查找链：条目自身命名空间（active→zh 回退）→ common 命名空间 → 键本身（缺失不隐藏） | `navigator.languages`/`navigator.language` 主子标签匹配 + Host 设置偏好 | 服务 + `locale/change` 事件 + LocaleFace 订阅 | 初始临时语言为浏览器语言，插件激活后 Host 持久值覆盖；`FALLBACK_LOCALE='zh'` |
| `src/locales/zh.ts` | **common 命名空间 zh 字典**（键集真源）：确定/取消/关闭/复制/复制成功/重试/加载中…/加载失败/提交/正在提交…/下一步/上一步/跳过/删除/编辑/保存/搜索/更多/收起/展开/返回/未知/无/已截断 | —— | 命名空间 `common` | 共享跨特性词表 |
| `src/locales/en.ts` | common 命名空间 en 字典，编译期校验补全 | —— | 命名空间 `common` | —— |
| `src/locales/settings.ts` | `settings.locale` 命名空间字典：zh={语言} / en={Language} | —— | 命名空间 `settings.locale` | —— |
| `src/locale-settings.ts` | 语言偏好 schema：`LOCALE_IDS=['zh','en']`，`LOCALE_SETTINGS_NAMESPACE='locale'`，字段 `preference`（可选，缺失→浏览器语言） | —— | 持久化到 `settings.yaml` 的 `locale.preference` | —— |
| `src/index.ts`（Host 注册） | 注册 `locale` 设置 section schema | `settings` 可选服务 | `ctx.inject(['settings'])` | —— |

---

## 三、connection —— 浏览器连接层（无可见 UI，但决定 GUI 行为）

浏览器与宿主之间的传输层。不渲染任何组件，但它的状态决定前端是否重连、会话数据是否可用。

| 组件/文件 | 渲染内容/作用 | 数据源 | Slot/机制 | 备注 |
| --- | --- | --- | --- | --- |
| `src/client/index.ts` | **服务提供者 `ctx.connection`**：选择 fixture 或 HTTP 传输、提供共享 api client、`isLoopback`、`hostDescription` 可观察源、通用 RPC 通道、`start(sinks, config)` 启动流控制器（单消费者，二次调用抛错） | URL 是否含 `?fixture` 决定 fixture | 提供 `connection` 服务 | `hostDescription` 仅在每个成功握手后发布真正 `host.describe` 值；断线/停止清空 |
| `src/client/connection.ts` | `ConnectionController`：打开 mux+host 双流并持续迭代，指数退避重连；`ConnectionState='connected'\|'reconnecting'`；严格握手（双流 onOpen + `host.describe` 成功才 onConnected） | api client | 流 pump + 回调解偶（sink 抛错不影响 pump） | 重连退避默认 base 500ms、factor 2、max 10s；stream open 超时 3s |
| `src/client/api.ts` | 连接契约聚合点：`IApiClient`/`AbstractApiClient`、RPC 类型、`HostDescription`、`resultOf()` | —— | 契约 | 浏览器安全，不拖宿主代码进 bundle |
| `src/client/web-api-client.ts` | 浏览器载体：unary/respond 用 `fetch`（HTTP POST），mux/host 各开一条**仅下行 WebSocket**；读到 `stream/error` 即断 | `events.mux`/`events.host` | 继承 `AbstractApiClient` | 客户端不发应用数据（丢弃 socket 消息只 enqueue 帧） |
| `src/client/rpc.ts` | 浏览器通用逻辑 RPC 调用器：`channel/endpoint` POST，HTTP origin 或内建 `http://dsh.internal`，校验 rpcId 匹配 | HTTP transport | 通用 RPC 通道 | 端点在浏览器侧白名单校验（防路径注入） |
| `src/client/random-uuid.ts` | UUID 生成 | —— | 工具 | —— |
| `src/client/fixture.ts` | **开发用假服务器**：`?fixture` 时无后端跑完整 UI，含 fx-alpha 74 回合历史脚本、markdown/terminal/read/search/web/diff/todo 样本、模型目录、pending approval/question、streaming 回放、token 用量等 | 内置脚本 | 实现 `AbstractApiClient` | **重建 demo 的重要数据源**，但非真实 UI 组件 |
| `src/index.ts`（Host 注册） | 注册 `/api` 路由 + WebSocket 升级路由 + trust 围栏 + 特权方法 loopback 钉死（`PRIVILEGED_METHODS`） | `apiProxy`/`webServer` | `/api` 前缀路由、`events.mux`/`events.host` 升级 | 特权方法：agentPreset.read/copy/openDocument/remove、host.pickDirectory/openPath、settings.*、credentials.*、llm.discoverModels |
| `src/http-bridge.ts` | node:http ↔ WHATWG fetch 桥梁；请求体内存缓冲，上限 `DEFAULT_MAX_REQUEST_BODY_BYTES=160MiB`，超限 413 | node server | `bridge(req,res,handler)` | SSE 流式写出带背压 |
| `src/rpc-host.ts` | Host Connection 服务（`ctx.connection`）：通用 RPC 通道注册（`rpc.handle`）+ `/api` 共享通道拦截器（`rpc.intercept`），含 fetch 形状 handler 与信封校验 | —— | 提供 host `connection` 服务 | 通道 `/api` 保留；拦截器先于 API Proxy 回退 |
| `src/websocket-downlink.ts` | Host 端 WebSocket 下行：`WebSocketDownlinks` 只发送对应帧文本，客户端发消息即 `1008 downlink only`；`rejectWebSocketUpgrade` 拒绝不可信升级 | apiProxy 事件流 | 两个 `events.*` 升级路由 | teardown 终止 socket 并等源清理 |
| `src/api-request-trust.ts` | `/api` 浏览器 trust 围栏：Host 头（must be loopback 或 trustedHosts 匹配）+ `sec-fetch-site` 拒绝 cross-site + Origin 须同源；`assertTrustedAuthority` 校验配置 | 请求头 | 每次 `/api` 请求与升级前校验 | DNS-rebinding 防御，非认证层 |
| `src/api-path.ts` | `/api` 前缀单一真源：`API_PATH='/api'`、`MUX_EVENTS_PATH='/api/events.mux'`、`HOST_EVENTS_PATH='/api/events.host'` | —— | 常量 | —— |
| `src/loopback-hostname.ts` | 浏览器安全 loopback 判定（localhost / [::1] / 127/8）；`ctx.connection.isLoopback` 的状态来源 | —— | 工具 | 包内私有，消费方用派生 state |
| `src/rpc.ts` | Host/Client 共享的逻辑 RPC 契约：`ConnectionRpcHandler`/`HostConnectionRpc`/`ClientConnectionRpc`、authority 策略 | —— | 契约 | —— |

### connection 对 GUI 的影响（断线如何表现）
- 前端通过 `ctx.connection.hostDescription` 观察连接；每次握手成功发布真实 `host.describe`，**断线/重连瞬间清空为 `undefined`**，所以依赖 Host 能力的 UI 在断线时失去答案、不保留陈旧信息。
- `ConnectionController` 只对外暴露 `connected`/`reconnecting` 两个粗粒度状态（初始未连接不报，当作"连接中"）。UI 可据此显示"连接中/重连中"。
- 断线后 mux+host 双 WebSocket 任一条断都会触发整代失败并重建两条流；重连成功后重新走完整握手再 onConnected。

---

## 四、hmr —— 客户端热更新（无可见 UI，影响开发重建方式）

| 组件/文件 | 渲染内容/作用 | 数据源 | Slot/机制 | 备注 |
| --- | --- | --- | --- | --- |
| `src/index.ts`（Host 半边） | 一个 interval 对每个 graph 行客户端 bundle 做 stat 轮询，内容变化即 `clientModuleHost.rebuilt(id)`；服务 `/plugins/events` SSE 通道广播 graph/rebuilt 帧 | `clientModules`/`webServer` | `clientModules.rebuilt`、`webServer.register('exact','/plugins/events')` | 无 watcher（`pnpm dev:web`）时轮询总无变化、链路空闲 |
| `src/client/index.ts`（浏览器半边） | 订阅 `/plugins/events` SSE，收到 `rebuilt` 帧按串行队列重载该 entry：invalidate→prefetch→registry.delete→排空旧 fiber→清 owned `<style data-plugin>`→`entry.refresh()` 重新导入挂载→`fiber.await()` 大声抛启动失败 | EventSource | 注入 `loader`（vendored Loader）与 `modules`（客户端模块系统） | 依赖 fiber 的级联自行发生（provider fiber uid 世代），HMR 侧零图分析；无失败回滚 |
| `src/events.ts` | `/plugins/events` 线协议：`{type:'graph',graph}`（连接时全量图）或 `{type:'rebuilt',id,rev}` | —— | 常量 `EVENTS_ENDPOINT='/plugins/events'` | 图帧仅连接快照，未使用 |

---

## 五、易遗漏项提示（给重建者）

1. **两个可见设置行都注册进 `settings.general.item` 槽**：order=0 是 Language（语言），order=10 是 Appearance（外观）——它们处于设置面板的"通用(General)"分组，不是独立页面。
2. **Appearance 是三块"色块"选择（不是下拉）**；Language 是 pill + Menu 下拉。两者图标都来自 `ui-primitives`。
3. **`system` 是主题"偏好"而非注册主题**；解析后的 active 是 `light`/`dark` 之一。UI 选择态读偏好而非 active。
4. **主题由 token 驱动，需一并重建 5 张样式表**（base / design-platform 亮暗双套 / scrollbar 双渲染路径 / gradient-shadow-text 含字体 / shiki 高亮）。亮暗切换全靠 `body[data-ds-dark-theme]` 属性 + `html{color-scheme}`。
5. **滚动条与语法高亮是独立样式层**，易漏；scrollbar 还有 Firefox/WebKit 两条互斥路径。
6. **Locale 查找链**：命名空间→common→键本身（缺失仍显示原文，不隐藏）。
7. **语言仅 zh/en 两种**；语言偏好缺失时回退到浏览器语言，`zh` 兜底。
8. **connection/hmr 无可见 UI**，但重建 demo 时：`?fixture` 参数可无后端跑全套 UI（`fixture.ts` 内置 74 回合带各类卡片/状态样本）；断线时 `hostDescription` 清空、状态翻为 `reconnecting`。
9. **Settings 持久化命名空间**：主题 `ui-theme.preference`、语言 `locale.preference`，都存在 `$DSH_HOME/settings.yaml`，且仅 loopback 浏览器可写；远程浏览器选择仅进程内。
