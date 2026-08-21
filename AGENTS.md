# AGENTS.md — DeepSeek Zion 复刻工程

本文件约束本仓库内**一切改动**(代码、样式、文档、UI 结构)。写给对本项目一无所知的 AI 编码代理:先读本文件,再按 §9 的文档索引深入。

---

## 1. 项目概览

`deepseek-zion` 是 **DeepSeek Harness(DSH)的桌面 GUI**:一个 Electron 壳 + 自建 React 18 + Vite **复刻 renderer**,把官方 dsh web 的 UI 按 UI 清单 **1:1 重做**(不直接加载官方 dist)。数据层不自己造协议,而是直接 new 官方运行时的纯 TS 类(「B 直拼」),并内嵌一个 cordis 插件运行时底座承接社区插件的 client 半。

- 当前阶段:**UI 风格化(Matrix 风)**——复刻官方 web UI(M1–M6)已交付,自 2026-08-20 起进入风格化阶段,§8 铁律正式生效;风格规范按 §8「风格路由」选择。
- **ZION 视觉层进行中**:视觉语汇(数雨/培育仓/神经线缆/feed 等)来自 ZION 主工程(pi-martix-ui,已废弃),视觉宪章与极简子集规范已入库(`DESIGN.md` / `MatrixDesign-minimal.md`);词表禁令随风格化阶段开始解除,但复刻的功能语义与领域词表仍以 `CONTEXT.md` 为准。
- 仓库形态:单仓单包,核心代码全在 `renderer/`。

技术栈:Electron(壳)、React 18 + TypeScript + Vite 6(renderer)、zustand/immer(少量)、官方 `@deepseek-ai/*` ESM 包(file: 引用,数据层)与 vendored 官方 client 源码(UI/协议层)。

## 2. 架构与代码组织

```
main.mjs                 Electron 壳:探测/拉起 dsh web(3080)、开窗。
                         --replica 分支:ensure 3080 → 缺 dist 先 vite build → 起 5199
                         preview → 窗口加载复刻 UI。默认模式(不带 --replica)是
                         prototype 遗留:加载官方 3080 UI,不是复刻。
preload.cjs              Electron preload。
renderer/
  ├─ vite.config.ts      build + /api proxy(剥 Origin 头过 trust fence → 127.0.0.1:3080);
  │                      alias 把 @deepseek-ai/dsh-client-* 解析到 vendor/ 源码。
  ├─ tsconfig.json       paths 与 vite alias 对应;type-only 缺失包用 vendor/ts-types/*.d.ts 占位。
  ├─ src/
  │  ├─ main.tsx         入口:PluginProvider → RuntimeProvider → AppFrame。
  │  ├─ protocol/assemble.ts   数据层装配(B 直拼):WebApiClient/FixtureApiClient →
  │  │                        ConnectionController → SessionManager → Session;
  │  │                        host/remote-event 帧分发。
  │  ├─ app/             React 侧适配层:runtime.tsx(hooks/模型/工作区/附件/useProjection)、
  │  │                    conversation.ts(「UI 逻辑面」Context,注册 chat/trajectory 节点 Definition)、
  │  │                    以及各官方 UI 包的 zion adapter(model-select/permission-ui/plan-seat/…)。
  │  ├─ plugin/          插件底座:runtime / slot-registry / evaluator(闭包求值)/ guard /
  │  │                    hub / remote / run-orchestrator / anchors / demo。
  │  ├─ ui/              自研复刻组件:AppFrame/Sidebar/ChatView/InputBar/ConversationDock/
  │  │                    ToolCallCard/QueueDock/SettingsShell/PluginHost/…(三栏 + 会话 +
  │  │                    对话流 + 工具卡 + 审批 + 队列)。
  │  └─ styles/          全局样式(原单文件 styles.css 按域拆分,2026-08-21):index.css
  │                       按原级联顺序 @import 聚合 14 个域文件(tokens/layout/sidebar/
  │                       chat/dock/composer/settings/plugin/…);**import 顺序不得调换**
  │                       (queue-row 等靠顺序覆盖),改样式先找对应域文件。
  └─ vendor/             官方 client 包 **TS 源码逐文件拷贝**,Vite 直编(官方发布的是
                         ClientModuleSystem bundle 不可直 import)。现有 15+ 包:
                         client-connection / client-runtime / client-web-react /
                         client-ui-slots / client-ui-conversation / ui-primitives(最小等位面)/
                         ui-trajectory / ui-model-selection / ui-plan / ui-permission-presets /
                         ui-user-questions / ui-agent-preset / ui-attachment / ui-input-trigger /
                         ui-commands / ui-jobs / ui-deliverables / ui-workflow-run / ui-skill /
                         ui-subagent / ui-directory-picker-browse / schema-form + ts-types(类型占位)。
probe-*.mjs              无头验收探针(Electron 加载 5199 页面跑断言;产物 probe-*-out/ 已 gitignore)。
docs/                    盘点与审计文档(UI 清单、RPC 接线清单、入口差距索引、真后端核验)。
backup/                  文档快照(.now/.orig 对照),非源码。
```

**两条运行线(别混淆)**:

- **复刻线**:`npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort`(或 `dev:web`)。不带 `?fixture` 经 `/api` proxy 连真后端 3080;带 `?fixture` 用官方 in-process 假后端(FixtureApiClient)。
- **Electron 壳线**:`npm run start:replica` 加载复刻界面;`npm run dev/start` 是 prototype 遗留(官方 UI)。

**插件运行时**:与复刻 UI 并行的旁路层,独立 `new Context()` + 代码求值器(`new Function` 包裹远程传送的插件 client 源码)+ guard 代理 + 附加型槽。只服务社区插件 client 半;复刻 UI 本体保持普通 React,不走 slot。插件只允许注册「附加型」槽(shell.overlay / conversation.chat.assistant-actions / conversation.input.dock / tool.call.toolview 新 key / settings.plugin.item / sidebar.footer.action 等);root/conversation/sidebar 主体位由复刻 UI 独占。

## 3. 构建与运行命令

```sh
npm install                 # 首次;file: 依赖指向本机 dsh 链(换机见 HANDOFF §6 / SYNC.md)
npm run build:web           # vite build → renderer/dist(改源码后必须重建,preview 服务的是 dist/)
npm run typecheck           # tsc --noEmit -p renderer/tsconfig.json
npm run dev:web             # vite dev server(5173)
npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort   # 复刻页面
npm run start:replica       # Electron 窗口加载复刻 UI(自动 ensure 3080 + build + preview)
npm run pack / npm run dist # electron-builder 打包(--dir / 安装包:win nsis+portable, mac dmg, linux AppImage)
```

## 4. 测试策略

本项目**没有单元测试框架**;验收全靠 **Electron 无头探针** + typecheck 基线对照:

- 探针:`npx electron <probe>.mjs`,加载 `http://localhost:5199/[?fixture]` 跑断言,输出到 `probe-*-out/`(截图 + 文本,已 gitignore)。全清单见 `HANDOFF.md` §4(约 25 个探针,覆盖 checklist 24 项回归、真后端专属项、轨迹/设置/模型/权限/附件/触发菜单/审批接管等)。
- **双轨口径**:新功能探针要同时跑 fixture 轨(快、确定性)和 real 轨(真后端 3080)。以官方 3080 UI 为基准核对入口形态。
- **typecheck 基线**:vendor 的 cordis/Fiber/ctx 类型噪音是**既有预期**(esbuild 剥离不碍事)。验收口径 = `src/` 不新增错误、错误文件列表对比基线(`baseline-errors.txt`,约 31 文件)不新增,用 `grep -v vendor` 过滤看新错。
- 探针技巧(别重踩,详见 HANDOFF §5):
  - React 受控输入必须用原生 value setter + dispatchEvent('input');
  - 探针 JS 经外层模板字面量转发时,`\n` 会被转义成真换行 → 用 `split(String.fromCharCode(10))`;
  - 拖拽合成事件之间要 sleep(React 状态提交是异步的);
  - 探针缝:`window.__zionProbePushMuxFrame(frame)`(fixture 限定)、`window.__zionProbeHandleRemoteEvent(...)`。

## 5. 红线(改代码前必看,与 CONTEXT.md 同源)

- **R1** 宿主 dsh 组合零改动;**R2** wire 契约零改动(52 RPC + respond + 双 WS(events.mux/events.host)+ session.export,只消费);**R3** 事件订阅完整(不丢 `host/remote-event`、`session/queue` 等);**R4** 会话语义不变、不伪造遥测,只展示官方运行时给出的真实事件/投影/结果;**R5** 无 prompt/工具/权限改动;**R6** surfaceContext 保留;**R7** 动效不拖累主线程。
- 复刻范围限定在 `CONTEXT.md` 词表内;ZION 词表禁止互灌。
- 领域语义:对话节点 12+1 种 kind、工具卡 10 个 key、投影「higher seq wins」合并等,以 `CONTEXT.md` 为准。

## 6. 开发约定

- **vendor 官方 UI 包的标准流程**(补差距/同步都用它,详见 HANDOFF §2):
  1. 从官方源码 clone(`D:\github-Clone\deepseek-harness`,HEAD `dsh-v0.1.0-rc.7`)的 `packages/client/<pkg>/src` 拷到 `renderer/vendor/<pkg>`;
  2. `renderer/vite.config.ts` 加 alias、`renderer/tsconfig.json` paths 加映射(type-only 缺失包用 `vendor/ts-types/*.d.ts` 空占位);
  3. 新 npm 依赖入 `package.json`;
  4. 写 zion 适配层(官方组件走 cordis 槽注入,zion 手写 adapter 补注入面,参考 `src/app/trajectory-pane.tsx`);
  5. `build:web` + 双轨探针 + tsc 基线对照,完成后回勾 `docs/ui-entry-gap-inventory.md` 与 HANDOFF。
- **官方 declare-module 增强的解析法**:官方各包用 `declare module '@deepseek-ai/dsh-client-ui-conversation/client'` 增强 `ChatNodeDataMap`;zion 无该包,tsconfig paths 把包名解析到**声明该接口的 vendored 模块**(`vendor/client-ui-conversation/client/contract/chat-nodes.ts`)使增强真实 merge。同法适用于其它「官方 declare module 增强」的包(前提:该包名不被其它具名导入消费)。
- vendor 里的官方文件如被微补丁,必须留注释标记(现有两例:PermissionSelect 的 `t` 类型本地化、PlanModeControl 的 `PlanChipInjected` 本地化)——都是避免拖入整套槽面的 surgical 修改,行为零改动。官方更新同步 vendor 时**先 `git log --oneline -- renderer/vendor` 查本地 patch 再覆盖**(SYNC.md §2)。
- **Windows 环境坑**:esbuild/vite/tsserver 持文件句柄缺 `FILE_SHARE_DELETE`,直接写文件可能 `ReplaceFileW EIO` → 写到临时文件再用 PowerShell `Copy-Item -Force` 覆盖。这是已知环境行为,不是 bug。
- `package.json` 的 `file:` 依赖是**本机绝对路径**(`C:/Users/zyf/.dsh/profiles/...`);跨机 pull 后需按本机用户改写(HANDOFF §6)。
- 3080 真后端常驻,**勿重启**(会话骑在它上);官方 dsh 升级流程见 `UPDATE-DSH.md`,代码同步见 `SYNC.md`。

## 7. 安全考虑

- `/api` proxy 指向 `http://127.0.0.1:3080` 并剥掉 `Origin` 头以过后端 trust fence——仅限本机回环,不要把 target 指向远程地址。
- 插件 evaluator 用 `new Function` 求值远程传送的插件源码,必须经 `guard.ts` 代理 ctx 收口;不要为图方便把宿主能力直接透传给插件。
- 不伪造遥测、不伪造会话事件(R4);审批/权限相关交互(Full access 风险确认、批准并信任)必须与官方语义一致,不得静默放行。
- 仓库内不存凭证;API key 等凭证读写全部经真后端 settings/credentials RPC。

## 8. 铁律:改 UI 风格时,不删复刻的 dsh web UI 展示内容

deepseek-zion 的定位是**复刻 dsh web 的 UI**(原 dsh web 界面)。任何 UI 风格化的改造(新主题、动效、布局调整、视觉重构),必须遵守:

1. **优先改样式,不删内容。** 允许自由修改:颜色、字体、间距、动效、位置、大小、圆角、文案措辞、主题切换等任何视觉属性。
2. **尽量保留原有 dsh web 展示内容与交互入口。** 例如:
   - 输入框面板左下角的 **`+` 按钮**(触发命令列表的入口);
   - 点击 `+` 后弹出的**命令列表**;以及其它类似的既有功能入口(发送/停止、模型选择、附件、队列/审批等)。
   - 改的是"外壳"(样式/位置/动效),不拆"功能与信息"(按钮、列表、面板、交互语义)。
3. **确需删除时,必须记录。** 当且仅当为了视觉/功能目的必须移除某个既有展示元素或交互入口:
   - 在 [`ui-change-log/`](./ui-change-log/) 下新建一条记录(按日期命名,如 `2025-06-01--remove-plus-command-list.md`);
   - 写明:删除了什么、为什么删、替代方案(如样式改写后仍保留功能)、验证方式;
   - 记录完成后才允许删除。

### 判据(拿不准时问自己)

- 这个元素在 dsh web 里存在吗?→ 存在则**默认保留**,只改样式。
- 删掉它会影响任何用户可达的功能吗(命令列表/附件/模型切换/队列……)?→ 会则禁止直接删除,必须走 `ui-change-log` 记录。
- 我只是想让它在视觉上"更贴合风格"?→ 那改样式就够了,不要删。

### 边界

- `ui-change-log` 本身是本规则的记账本,不被当作可删除的展示内容。
- 此铁律适用于复刻的 dsh web UI 部分;新增的独有功能(非 dsh web 语义)不受约束。
- 任何强制删改均以 `ui-change-log` 记录为准,删除前先提交记录。
- **生效说明**:本条铁律自 2026-08-20 起正式生效(复刻阶段结束,进入 UI 风格化阶段);此前的复刻期删改无需补记。

### 风格路由(极简 Matrix ↔ 完整电影风)

每次 UI 风格设计任务,先按用户措辞选择设计规范:

- 用户说「极简风 / 极简主义 / 简约 / 克制」或类似 → 读 [MatrixDesign-minimal.md](./MatrixDesign-minimal.md),按其密度纪律与禁用清单设计
- 用户说「电影化 / 电影风 / 强烈视觉效果 / 更 Matrix 风」或类似 → 读 [DESIGN.md](./DESIGN.md)(ZION 完整视觉宪章)
- 用户未指明 → **默认极简**(MatrixDesign-minimal.md);拿不准先问用户

两份规范都受本铁律约束:改样式,不删复刻的 dsh web 展示内容与交互入口。

### UI 迁移阶段规则(zion-ui-visual-inventory 驱动)

迁移 pi-martix-ui-dev 的 UI 块进本仓时,强制流程、官方口径核查与硬性判定见 [`.agents/skills/zion-ui-migration/SKILL.md`](./.agents/skills/zion-ui-migration/SKILL.md)(迁移任务的唯一权威,触发即加载);本铁律与 ui-change-log 记账对迁移同样生效。

## 9. 文档索引(按必读顺序)

1. **`HANDOFF.md`** — 交接文档:当前进度 / 最近提交链 / 探针全清单 / 环境与换机 / 开发约定挖坑清单。新会话**先读它**。
2. **`CONTEXT.md`** — 领域词表 + 红线 R1–R7(复刻 renderer / 外壳 / B 直拼 / 插件运行时 / 附加型槽等概念定义)。
3. **`renderer/M1-验收记录.md`** — 里程碑 M1→M6 的交付/验证/遗留。
4. **`SYNC.md`** — 官方 harness 更新后的同步机制(4 个耦合面:file: 面包 / vendored 源码 / cordis 版本 / wire 契约)。
5. **`UPDATE-DSH.md`** — 本机 dsh 运行时升级/回滚流程。
6. **`docs/`** — UI 清单(`ui-component-inventory.md`、`ui-entry-gap-inventory.md`)、RPC 接线清单、真后端核验归因等审计文档;`docs/zion-ui-visual-inventory.md` 与 `docs/ui-inventory/` 是 ZION 侧迁移过来的视觉块/界面清单。
7. **`DESIGN.md` / `MatrixDesign-minimal.md`** — ZION 完整视觉宪章(电影风)与极简 Matrix 风子集规范;何时读哪份见 §8「风格路由」。
