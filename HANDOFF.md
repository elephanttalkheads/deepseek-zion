# DeepSeek Zion 交接文档(Handoff)

> 交接时间:2025-08。交接人:原开发会话(deepseek-v4-flash on DSH)。接任对象:**本机新会话** 与 **另一台电脑 clone** 的 deepharness / kimi code(任何能读代码库的 agent)。
> 本文件是新会话 / 新机器**首要必读**入口,再按需读取下文引用的既有文档与源码。已提交的历史见 git log;**本文件只记录仓库里搜不到、只能从对话推导出的上下文**——重复内容一律指向既有文件。**官方 harness 更新后的同步流程见 [SYNC.md](SYNC.md)。**

---

## 0. 一句话项目定位

`deepseek-zion` = 为 DeepSeek Harness(DSH)封装的桌面 GUI。**干掉「官方 UI 皮肤层」这一条路线**,改走:**自建 React 18 + Vite 复刻 renderer,数据层直接用官方纯类(B 直拼),插件底座让社区插件跑起来**。当前做到「功能对等(大致相似)+ 插件运行时底座 + 真后端联通」,尚未做「像素 1:1 精修」。

一句话当前状态:**M1–M6 全部完成并推送,工作区干净**(`git status` 0),远端正出 `f038516`。

---

## 1. 当前进度(已交付,均已在 git)

提交链(`git log --oneline`,`main`):

| 提交 | 内容 |
|---|---|
| `fdb746b` | prototype:Electron 壳加载真实 dsh web(官方 UI,里程碑前身) |
| `cd9f749` | M1–M3:三栏骨架/会话列表/流式对话/工具卡/审批问卷/队列 dock/模型·工作区/附件限额 |
| `ce7b28e` | M4:插件运行时底座 + 真后端(3080)proxy 连通 + 24 项清单(24/24)+ vision 回归 |
| `e11cd60` | 追回被 gitignore 误吞的 `renderer/M1-验收记录.md`(Windows 大小写不敏感,`m1-*` 吃了 `M1-*`) |
| `d544290` | M5:剩余附加型槽锚点(assistant-actions / settings.plugin.item / tool.call.toolview)+ cordis_run 审批编排 |
| `f038516` | M6:host.call remote invoke + 队列 steer/updateQueue + approve 全链路路径验证 |

**里程碑验收记录(主文档,先读)**:`renderer/M1-验收记录.md` — 含每批交付/验证/遗留,最后一节是 M6。

**领域词表**:`CONTEXT.md` — 领域术语与红线(必读,防概念串台)。

### 架构事实(重要,仓库注释里有但新会话值得先建立心智模型)

- **两层分离**:
  - 数据层 = **官方运行时骨架,纯类直拼(B 直拼)**:`renderer/vendor/` 里的官方 client 源码(`client-connection`/`client-runtime`/`client-web-react`/`client-ui-slots`),由 Vite 直编;不经 cordis 装配。装配入口 `renderer/src/protocol/assemble.ts`(ConnectionController → SessionManager → Session),React 侧 `app/runtime.tsx` 用官方 `bindSnapshotSelector` 绑 hooks。
  - 对话定义层 = 官方 `client-ui-conversation` 的节点定义,挂在**一个**「UI 逻辑面」`new Context()`(`app/conversation.ts`)。
  - 插件运行时 = 旁路底座,`renderer/src/plugin/`(详细见 §4)。
- **wire 契约零改动**:只消费,不重写 52 RPC + respond + 双 WS + session.export。
- **真后端联通方式**:`renderer/vite.config.ts` 的 `/api` proxy → `http://127.0.0.1:3080`(changeOrigin + ws + **剥 Origin**)。3080 有 `api-request-trust` fence(要求 Host=loopback 且 Origin 同源或缺省),不剥 Origin 会 403。复刻页面在 5199 不带 `?fixture` 即走 WebApiClient 连真后端。
- **UI 结构**:`renderer/src/ui/` — AppFrame(三栏+顶栏)/ Sidebar(会话列表)/ ConversationDock(中央)/ DetailsPanel(右栏)/ ChatView(节点渲染)/ InputBar(composer)/ ToolCallCard / InteractionDock(审批+问卷)/ QueueDock / PluginHost。

---

## 2. 环境与运行(本机)

- 路径:`D:\deepseek-zion`(工作区),仓库 `origin=https://github.com/elephanttalkheads/deepseek-zion.git`(`main`)。
- Node/DSH:Windows;DSH 装在 `C:\Users\zyf\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh\`;DSH_HOME=`C:\Users\zyf\.dsh`;官方 npm 链在 `C:\Users\zyf\.dsh\profiles\node_modules\@deepseek-ai\`(rc.6,file: 引用)。
- 官方 harness 源码 clone:`D:\github-Clone\deepseek-harness`(改代码/查契约都看这里,`packages/extensions/...` 是 cordis-runner、`packages/host/apiproxy` 是 wire)。
- 常用命令:
  - 构建:`npx vite build --config renderer/vite.config.ts`(root=renderer,输出 `renderer/dist`)。
  - 类型检查(只查 `src/`,vendor 的 cordis 类型噪音是既有的,不算错):`npx tsc --noEmit -p renderer/tsconfig.json`(grep 掉 vendor 行)。
  - preview(复刻页面):`npx vite preview --config renderer/vite.config.ts --port 5199 --strictPort`(后台 job)。
  - Electron 壳:无头验收用 `npx electron <probe>.mjs`(各探针,见 §5)。
  - 依赖:`npm install`(file: 引本地 rc.6;`dsh-llm-retry` 那行 file: 指向 dsh 安装内部 node_modules,换机器要改,见 §6)。

---

## 3. 后续开发方向(按优先级,来自验收记录「遗留」+ 本项目本质)

1. **像素 1:1 精修(浅色主题)**:官方当前新版是**浅色两栏**(品牌/工作区/搜索/设置嵌左栏 + 中央 hero/composer),复刻是深色三栏骨架。要接近官方,需:主题变量改浅色、右栏与顶栏布局对齐、中央 hero/composer 字面已一致(探索未至之境/预览版)。→ 属于「超出大致相似线、下一步最有视觉感」的工作。
2. **approve 全链路最后一段**:真后端当前插件 inventory 为空,且新建会话的 agent(web profile)**没有 cordis_define/cordis_run 工具**,浏览器侧也没有 define RPC(define 仅模型工具)。要验证「批准→client 加载→槽渲染」最后一跳,需要:(a) 在带 cordis 工具的宿主会话里定义并运行一个真实插件,或 (b) 未来 host 暴露 define 的浏览器通道。wire 形状已按官方 remote-client 对齐,只差真实运行对象。
3. **host.call 成功路径**:当前 `host.call` 在无宿主半时教学拒绝已闭环;真插件跑起来后,`harness.handle`(宿主半注册)→ `host.call`(client 半调用)双向要验。
4. **队列 edit 操作**:QueueAction 支持 `{kind:'edit', content}`;UI 只接了 steer/remove,可补编辑。
5. **插件附加型槽剩余锚点**:已接 shell.overlay / sidebar.footer.action / conversation.input.dock / assistant-actions / settings.plugin.item / tool.call.toolview。白名单里还有 conversation.composer.dock / input.left / input.right / input.overlay / settings.action 等 16 槽,需要往 UI 对应位置补锚点。
6. **多工作区/会话 CRUD 补全**:新建/归档/重命名真后端验证(当前 UI 已有骨架,`新会话` 按钮还是 M2 占位)。
7. electron-builder 打包产物跑真(dists/pack)。

---

## 4. 如何为 deepseek-zion 开发插件(核心:两类插件)

### 4A. 动态 Cordis 插件(client 半,社区/创造模式;走插件底座)

**这不是「写官方 dsh 插件」而是「给复刻底座写 client 半源码」**。底座定义见 `CONTEXT.md`「插件运行时 / community 插件 / slot 注入面」。

底座构成(全部在 `renderer/src/plugin/`,读一遍就懂):
- `min-ctx.ts` — 极简 cordis Context(fiber.inject/get/provide/effect/on/timeout/_dispose)。
- `slot-registry.ts` — 附加型槽白名单 `ADDITIVE_SLOT_SPECS`(16 槽);`register` 必须是原型方法;`isHostSeat` 拒绝 root/conversation/sidebar 等主机位;`tool.call.toolview` 已发货 10 个官方 key 拒绝抢占。
- `evaluator.ts` — `evaluateClientHalf`:`new Function` 闭包求值插件源码(React 是闭包参数、console/styles/host/harness/traps 是参数);浏览器 timer/fetch/require 被 trap;`host.call` 走 `env.invoke`。
- `guard.ts` — `dynamicCordisContext`:白名单 Proxy;属性直读必须 `inject` 声明;`slots` 有专用坐席(自动阴影优先级 + ledger + trackSlotDispose)。
- `runtime.ts` — `PluginRuntime.load`:直拼 apply 替代 cordis Loader;卸载时槽 disposer + styles + ctx 全清。
- `hub.tsx` — 单例 + React Provider + `usePlugins()` + `getPluginRuntimeHandle()`(非 hook 出口)+ cordis_run 审批面。
- `remote.ts` — `dynamicCordisRunner.*` wire 桥(`POST /api/dynamicCordisRunner/<m>`),零 cordis。
- `run-orchestrator.ts` — cordis_run 审批编排(open/approve/decline → runHostHalf → getClientCode → load → resolve)。
- `anchors.tsx` — `SlotAnchor`:list/keyed/single 按槽 kind 渲染;keyed 按 `ownerProps.key/tool` 过滤。

**写一个 client 插件的模板**(源码字符串,如 `demo.ts`):

```js
return {
  name: 'my-plugin',
  inject: ['slots'],
  apply(ctx) {
    ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
      { name: 'conversation.input.dock', id: 'my-entry', order: 10, label: '我的' },
      () => React.createElement('div', null, 'hello'),   // 用 createElement,绝不能写 JSX
    ))
  },
}
```

要点:
- **纯普通 JS、绝无 JSX/TS、无 import**;React 是闭包符号,用 `React.createElement`。
- 只能注册**附加型槽**;注册 root/conversation/sidebar 会被 guard 拒(教学错误)。
- 想让插件实际跑起来有两条路:`PluginHost` 的「载入演示/禁区探针」按钮(本地演示),或走 cordis_run 审批编排(真链路)。
- 若要与宿主半互通:`host.call('method', args)` 会走 remote.invoke;宿主半(`harness.handle`)在**真实 dsh 进程**里,需要 3080 上有真实运行插件才通。

### 4B. 官方 dsh 插件(host+client 双半,经模型工具 cordis_define/cordis_run)

这是**官方语义**的插件(模型用 `cordis_define`/`cordis_run` 定义运行)。复刻 renderer 的插件底座是**为承接这类插件 client 半**而生的:host 半在真实 dsh 进程跑,cordis_run 会向浏览器推 `host/remote-event(cordis/request-run)`,复刻收到后渲染审批卡 → 允许 → runHostHalf → getClientCode → 底座 `runtime.load` 求值 client 半 → 注册进附加型槽。

写这类插件的模板(模型侧代码,含 host+client):

```js
return {
  kind: 'new', idPrefix: 'mydemo',
  name: 'My Demo', purpose: '演示',
  code: {
    host: `return { apply(ctx) { ctx.on(...) } }`,       // 真实 dsh 进程
    client: `return { inject: ['slots'], apply(ctx) { ctx.slots.inject('sidebar.footer.action', ...) } }`,  // 复刻底座承接
  },
}
```

复刻侧接住它的链路已实现到「批准 → runHostHalf/getClientCode」,client 半源码到位后 `runtime.load` 就能求值 + 挂槽。

---

## 5. 如何更新(日常提交 + 换机起步)

### 日常(本机)
1. 改 `renderer/src/**`;`npx vite build` 出 `renderer/dist`;`npx tsc --noEmit` 自查(过滤 vendor 行)。
2. 用探针验证(见 §7),证据拷到 `D:\pi-martix-ui\zion-verify\`。
3. 提交:`git add -A` → `git commit` → `git push origin main`。
   - `.gitignore` 已含 `renderer/dist/`、`probe-*-out/`、`renderer/m[N]-*` 探针产物。**注意 `!renderer/M1-验收记录.md` 必须保留**(否则大小写不敏感又把验收记录吞了)。
   - 提交信息带里程碑/批次(历史风格参考)。

### 换机/clone 后起步(new machine)
```bash
git clone https://github.com/elephanttalkheads/deepseek-zion.git
cd deepseek-zion
npm install
# 注意 package.json 里 file: 指到本机 rc.6 链(如 C:/Users/zyf/.dsh/profiles/...)
# 与 dsh-llm-retry 指到 dsh 安装内部路径 —— 换机要改成你自己机器上的真实路径,或改成 npm 版本。
# 官方 client 四包已 vendor(renderer/vendor),不需要额外装;apiproxy/session/llm 等 ESM 面包仍需在本地有同版本源码反射。
npx vite build --config renderer/vite.config.ts
```
换机常见坑:
- **file: 依赖路径**是你的机器专属,clone 下来会自动指向仓库里的原路径(不存在)→ `npm install` 会失败或装到错地方。做法:改 package.json 的 file: 指向你机器上的对应包,或把这些面包也 vendor。
- 官方源码 clone 用于查契约/改代码(`D:\github-Clone\deepseek-harness` 本机),换机可另 clone 或只依赖文档/注释。
- 视觉工具证据目录 `zion-verify` 在 `D:\pi-martix-ui\`,不是仓库内容;换机可自建任意目录,记得把探针输出拷进 allowedDirs 才能被 vision 工具读。
- **不要改宿主 dsh 组合**(红线):复刻可移植到任何跑着 dsh web(3080)的机器,只要 `/api` proxy 指向它。

### 开发约定挖坑清单(本会话踩过,别再踩)
- vite `preview` 会**锁文件**(Windows EIO),改 `renderer/src` 前先杀 5199 进程(`Get-NetTCPConnection -LocalPort 5199` → Stop-Process)。
- `Windows 忽略大小写` 让 `.gitignore` 的 `renderer/m1-*` 匹配到 `M1-验收记录.md`——已用 `!` 反否定,别删。
- vendor 里 cordis 类型噪音(Service/Fiber/ctx 不匹配)是**预期**,esbuild 剥离不影响运行;tsc 只看自己 `src/`。
- `host/remote-event` 帧在 `assemble.ts` 里已分发;再加转发事件只需在那加 case。
- 探针用 Electron 无头(`show:false`)加载 5199;连真后端页不带 `?fixture`。

---

## 6. 交接对象特别说明(本机新会话 & 远程 clone)

- 本文件即你(接任 agent)的入口。**先读这个文件,再读 `renderer/M1-验收记录.md` 尾部(M1→M6)与 `CONTEXT.md`**。
- 你在哪台机器都行:**主仓库在 GitHub**(`elephanttalkheads/deepseek-zion`,`main` 最新 `f038516`)。clone 即得全部代码和探针。
- 你的职责延续方向见 §3;第一优先建议做「浅色主题化逼近官方布局」,因为它最能肉眼见效且不碰任何红线。
- 若你做插件相关:`renderer/src/plugin/` 是全部答案;`CONTEXT.md`「插件运行时/slot 注入面」给设计口径。
- 若做真后端验收:先 `dsh --profile web --port 3080`(或已有),再起 5199 preview,探针 `probe-real/checklist/queue-*` 覆盖大部分。
- **sensitive**:无 API key/密码在本仓库;只有机器专属路径(file: 依赖)需要在换机时自洽。

---

## 7. 既有验收探针(每个都是可跑的无头验收脚本,`npx electron <name>.mjs`)

| 探针 | 作用 | 数据源 |
|---|---|---|
| `probe-m3.mjs` | M3:审批/问卷/模型选择/附件(交互闭环) | fixture |
| `probe-real.mjs` | 复刻连真后端首屏(只读) | 3080 |
| `probe-checklist.mjs` | 24 项功能清单(24/24) | 3080 |
| `probe-official-real.mjs` | 官方 3080 首屏对照基线 | 3080 |
| `probe-hero.mjs` | hero 态截图(像素对照) | 3080 |
| `probe-plugin.mjs` | 插件底座:载入/附加型槽/卸载归零 | fixture |
| `probe-queue.mjs` | 队列真后端激活(排队行渲染) | 3080 |
| `probe-cordis-run.mjs` | cordis_run inventory RPC 真后端 | 3080 |
| `probe-cordis-approval.mjs` | 审批卡渲染 + 拒绝清除(合成事件) | 3080 |
| `probe-hostcall.mjs` | host.call remote invoke 教学错误 | 3080 |
| `probe-queue-ops.mjs` | 队列 steer/updateQueue 端到端(建新会话) | 3080 |
| `probe-approve-real.mjs` | approve 全链路(定义真实插件;受环境所限走不完整) | 3080 |
| `probe-approve-path.mjs` | approve 编排器 + host wire 权威路径(合成 request-run) | 3080 |

探针输出目录 `probe-*-out/` 已 gitignore;验收证据归档在 `D:\pi-martix-ui\zion-verify\`(本机)。

---

## 8. 建议启用的既有 skill(接任工作流)

- **`editing-cordis-compositions`** — 凡涉及改 harness 组合/预设、诊断某行没挂上时必用(本文所有涉及 cordis 的修改都属于此)。
- **`domain-modeling`** — 该 skill 是本仓库词表 `CONTEXT.md` 的源头;改领域概念/术语前先走它,别让复刻与 ZION 语汇串台。
- **`handoff`** — 每个大阶段/换会话前重写本文件视角。
- **`grilling` / `grill-with-docs`** — 立项/方案定稿前压测思路(本项目当初就是靠 grilling 定了 Q1–Q20 决策)。
- **`vision-skills`** — 像素回归/UI 还原/元素定位都走它(注意 allowedDirs:图片要在 workspace 或 temp)。
- **`research`** — 查官方契约/源码时,委托子代理读 `D:\github-Clone\deepseek-harness` 并对齐 wire(本会话的 `plugin-runtime-design.md` 就是这么来的)。

---

## 9. 红线(改代码前必看,`CONTEXT.md` 同源)

R1 宿主组合零改动(R2 安装不动宿主 dsh 进程内配置;本仓库是纯前端代码,不碰 dsh 内部组态)。
R2 wire 契约零改动:52 RPC + respond + 双 WS + session.export 只消费。
R3 事件订阅完整:别丢 `host/remote-event`、`session/queue` 等在 `assemble.ts` 的分发。
R4 会话语义不变:数据只来自官方运行时真实帧,不伪造遥测。
R5 无 prompt/工具/权限改动。
R6 surfaceContext 保留。
R7 动效不拖累主线程(当前深色主题无大动效,未来加动效要遵此)。

---

*本文件由原开发会话生成,信息截至 M6(`f038516`)。如接手后有重大架构变化,请更新本文 §1/§3/§4 并 git add 之。*
