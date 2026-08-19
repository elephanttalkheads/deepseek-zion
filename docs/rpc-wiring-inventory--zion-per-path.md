# 功能接线全景清单 — dsh web RPC/写路径 × zion 已桥/未桥/需补

> 审计人:functional-wiring auditor（只读,未改任何文件）
> 语义:本清单回答「dsh web 客户端会用到的 RPC/写路径,zion 现在能调通多少」——偏向「功能能调吗」,补充前一份 `docs/ui-inventory-audit--zion-data-feasibility.md`(偏「内容能画吗」)。
>
> 判定分层(贯穿全文):
> - ✅ 已桥 —— zion 代码已直连该 RPC/写路径,当前 UI 能触发且在 3080 或 fixture 至少一端生效。
> - 🔧 noop 堵死 —— zion 显式给了空实现(`noopRemote`),该功能被硬断。
> - ⬜ 未桥 —— 有官方契约 + fixture 有实现,但 zion UI/接线没接。
> - 🧪 仅 fixture —— 只在 fixture 有实现(或可生效),真后端(3080)语义不同/无。
>
> 约定:官方契约为一手来源(`D:\github-Clone\deepseek-harness\packages\host\apiproxy\src\api\`);zion 侧路径一律用仓库相对路径(`renderer\...`)。

---

## 0. 一句话结论

zion 用「B 直拼」把官方 **纯类** 完整接入（`ConnectionController → SessionManager → Session → projection`）,因此 **52 条 RPC 里"读取/展示"侧几乎全通**(依赖匹配的 API 只在被触发时才发出)。但**写路径大面积没接 UI**:真正被 UI 调通的写路径只有 `session.prompt / session.cancel / session.selectModel / respond(审批/问答)`;其余写路径(create/rename/fork/workspace CRUD/agentPreset/goal/settings/credentials/subagents)要么是页面 `/* M2 */` 占位,要么根本没触发。slash 命令执行被 `noopRemote.commands.execute` **硬堵死**。插件 run 走独立 `dynamicCordisRunner` 通道(已桥,但 fixture 不实现,仅真后端)。

---

## 1. 总览表(52 RPC + 非 52 RPC 写路径)

| # | RPC/功能路径 | 官方方法 | zion 状态 | 谁在调(组件/会话路径) | 缺什么 |
|---|---|---|---|---|---|
| 1 | 会话列表 | `session.list` | ✅ | SessionManager.refreshList(manager.ts:449,handleConnected→refreshList) | — |
| 2 | 全局搜索 | `session.search` | ⬜ | SessionManager.search(manager.ts:518)存在,无 UI 调;Sidebar 只做本地过滤 | 接 onQueryChange 走远程 search |
| 3 | 建会话 | `session.create` | ⬜ | Sidebar「+」/AppFrame「新会话」= `{ /* M2 */ }`(Sidebar.tsx:61,AppFrame.tsx:29) | 调 manager.create() |
| 4 | 历史 | `session.history` | ✅ | Session.open → history(session.ts:777) | — |
| 5 | 模型目录 | `session.models` | ✅ | runtime.tsx:142(选中会话) | — |
| 6 | 选模型 | `session.selectModel` | ✅ | runtime.tsx:215 → 再拉 models | — |
| 7 | 重命名 | `session.rename` | ⬜ | Session.rename(session.ts:343)存在,无 UI 触发 | 加 rename 入口/上下文菜单 |
| 8 | 派生会话 | `session.fork` | ⬜ | SessionManager.fork(manager.ts:580)存在,无 fork 按钮 | 消息/会话 fork 入口 |
| 9 | 发消息/指令 | `session.prompt` | ✅ | runtime.sendPrompt → session.prompt(queue)(runtime.tsx:199) | — |
| 10 | 附件读取 | `session.attachment` | ✅ | Session(attachment 授权读),InputBar 图片链路 | — |
| 11 | 队列变更 | `session.updateQueue` | 🔧/🧪 | runtime.updateQueue(session.ts:287);UI 有 steer/remove(QueueDock)但 **fixture 恒返 queue-item-not-found**(fixture.ts:2494),fixture 也不产生 queue 帧 | fixture 补 queue 场景;真后端可生效 |
| 12 | 停止 | `session.cancel` | ✅ | runtime.stop → session.cancel(session.ts:321) | — |
| 13 | 子代理目录 | `subagent.list` | ⬜/🧪 | SessionManager.refreshSubagents(manager.ts:362)已接线,但 zion 无子代理树 UI;fixture 返空 `entries`(fixture.ts:2511) | 子代理树 UI + fixture 数据 |
| 14 | 子代理历史 | `subagent.history` | ⬜/🧪 | Session 按 address 路由(session.ts:778);无 UI 选中子代理 | 同上 |
| 15 | 子代理 prompt | `subagent.prompt` | ⬜/🧪 | Session.subagentPrompt(session.ts:228);无 UI | 同上 |
| 16 | 子代理 interrupt | `subagent.interrupt` | ⬜/🧪 | Session(session.ts:320);无 UI | 同上 |
| 17 | host 描述 | `host.describe` | ✅ | ConnectionController 连接握手(assemble.ts) | — |
| 18 | 选目录 | `host.pickDirectory` | ⬜/🧪 | 无「打开工作区/选目录」UI;fixture 有实现(fixture.ts:2531) | 工作区创建的面包屑 picker |
| 19 | 列目录 | `host.listDirectory` | ⬜/🧪 | 无浏览 UI;fixture 有树(fixture.ts:2532) | 同上 |
| 20 | 建目录 | `host.createDirectory` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2548) | 同上 |
| 21 | 打开路径 | `host.openPath` | ⬜/🧪 | 无 UI;fixture 恒 ok(fixture.ts:2564) | 打开文档/目录按钮 |
| 22 | 工作区列表 | `workspace.list` | ✅ | runtime.tsx:152 → 顶栏工作区名 | — |
| 23 | 建工作区 | `workspace.create` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2571) | 工作区新建入口 |
| 24 | 工作区重命名 | `workspace.rename` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2588) | 同上 |
| 25 | 工作区删除 | `workspace.delete` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2613) | 同上 |
| 26 | 工作区排序 | `workspace.insertBefore` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2627) | 同上 |
| 27 | 会话排序 | `workspace.insertSessionBefore` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2659) | 同上 |
| 28 | 归档会话 | `workspace.archiveSession` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2687) | 会话归档 |
| 29 | 技能目录 | `skill.list` | ⬜/🧪 | 无技能列表 UI;fixture 返 2 条假数据(fixture.ts:2780) | 技能入口 |
| 30 | 预设列表 | `agentPreset.list` | ⬜/🧪 | 无预设选择 UI;fixture 有(fixture.ts:2701) | 预设 picker |
| 31 | 选预设 | `agentPreset.select` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2710) | 同上 |
| 32 | 读预设 | `agentPreset.read` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2714) | 同上 |
| 33 | 复制预设 | `agentPreset.copy` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2730) | 同上 |
| 34 | 打开预设文档 | `agentPreset.openDocument` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2753) | 同上 |
| 35 | 删预设 | `agentPreset.remove` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2765) | 同上 |
| 36 | 建目标 | `goal.create` | ⬜/🧪 | 无 goal 编辑 UI;fixture rpc 面/fixture goals 面均有(fixture.ts:3015 / 2795) | goal 编辑器 |
| 37 | 编辑目标 | `goal.edit` | ⬜/🧪 | 同上 | 同上 |
| 38 | 暂停目标 | `goal.pause` | ⬜/🧪 | 同上 | 同上 |
| 39 | 恢复目标 | `goal.resume` | ⬜/🧪 | 同上 | 同上 |
| 40 | 完成目标 | `goal.complete` | ⬜/🧪 | 同上 | 同上 |
| 41 | 清除目标 | `goal.clear` | ⬜/🧪 | 同上 | 同上 |
| 42 | settings 描述 | `settings.describe` | ⬜/🧪 | 无设置 UI;fixture 有(fixture.ts:2899) | 设置页 |
| 43 | 打开设置文档 | `settings.openDocument` | ⬜/🧪 | 无 UI;fixture 恒 ok(fixture.ts:2912) | 同上 |
| 44 | 更新设置 | `settings.update` | ⬜/🧪 | 无 UI;**fixture 恒返 settings-rejected 只读**(fixture.ts:2913);真后端可写 | 设置页(真后端才"生效") |
| 45 | 覆盖设置 | `settings.replace` | ⬜/🧪 | 同上(fixture.ts:2918) | 同上 |
| 46 | 路径变更设置 | `settings.mutate` | ⬜/🧪 | 同上(fixture.ts:2923) | 同上 |
| 47 | 凭据描述 | `credentials.describe` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2930) | 凭据管理 UI |
| 48 | 存凭据 | `credentials.set` | 🧪 | 无 UI;fixture set/unset 会翻内存徽标(fixture.ts:2937) | 凭据表单 |
| 49 | 删凭据 | `credentials.unset` | 🧪 | 同上(fixture.ts:2941) | 同上 |
| 50 | 供应商目录 | `llm.providers` | ⬜/🧪 | 无 UI;fixture 返 4 供应商(fixture.ts:2947) | LLM 设置页 |
| 51 | 模型目录(全局) | `llm.models` | ⬜/🧪 | 无 UI;fixture 有(fixture.ts:2957) | 同上 |
| 52 | 探测模型 | `llm.discoverModels` | 🧪 | 无 UI;fixture 返自身目录(幻想端点,fixture.ts:2961);真后端可真实探测 | LLM 设置页 + 真后端核对 |
| — | 审批/问答响应 | `respond`(非 52) | ✅ | InteractionDock → wait.respond → api.respond(fixture.ts:2965 翻转) | 真后端亦生效 |
| — | slash 命令执行 | `commands.execute`(Remote,非 52) | 🔧 | **noopRemote 抛错**(assemble.ts:28);Session 从不直调(见 §5) | 见 §4/§5 |
| — | 命令列表 | `commands.list`(Remote,非 52) | ⬜ | noopRemote **无此成员**;无 `+` 命令面板 UI | 接 + 按钮面板 |
| — | 插件 run host 半 | `dynamicCordisRunner/*`(独立通道) | ✅ | plugin/remote.ts createWebConnectionRpc 直发(remote.ts:81),hub.tsx 编排 | **fixture 不实现**(fixture rpc 面仅 commands/goals,其余 reject) |
| — | 会话任务帧 | `session/jobs`(mux 帧,非 52) | ✅(消费) | manager.ts:705 jobsBySession | fixture **从不发**;数据仅真后端有 |
| — | 消息反馈 | messageFeedback | ⬜(不存在) | 全仓库无此 RPC/帧/UI;唯一"反馈"是 lastAgentError 展示(QueueDock.tsx:30) | dsh web 若有点赞/踩需要另接 |
| — | 会话导出 | `GET /api/session.export`(downloads) | 🧪/⬜ | fixture 返 404 桩(fixture.ts:2994);真后端走下载器 | 导出按钮 |

---

## 2. 按状态分层

### ✅ 已桥 —— 功能已通(dsh web 直连,当前 UI 可达)

| 功能 | RPC/写路径 | 证据 |
|---|---|---|
| 会话列表 + 选中 | session.list | manager.ts:449 / runtime.tsx:159 |
| 会话历史(含翻页/投影) | session.history | session.ts:777 |
| 模型目录 + 选模型 | session.models / selectModel | runtime.tsx:142/215 |
| 发消息(queue 模式) | session.prompt | runtime.tsx:199 |
| 停止 | session.cancel | runtime.tsx:204 |
| 附件读 | session.attachment | Session 内 |
| 审批 + 问答响应 | respond | InteractionDock.tsx:80/97 → session.ts:489/502 |
| 工作区列表(顶栏名) | workspace.list | runtime.tsx:152 |
| host 描述(握手) | host.describe | assemble.ts ConnectionController |
| 插件 run host 半(**真后端**) | dynamicCordisRunner/* | remote.ts:79 / hub.tsx:42 |

### 🔧 noop 堵死 —— 被死路硬断

`assemble.ts:26-30` 的 `noopRemote`:
```ts
const noopRemote = { commands: { async execute(): Promise<never> { ...throw... } } }
```
- 对 `SessionManager(api, noopRemote, ...)`(assemble.ts:60)。
- 它**只有 `commands.execute` 一个成员**(且抛错);`commands.list` 成员根本没声明。
- 被它堵死的功能:(详见 §4/§5)
  - `commands.execute` —— slash 命令客户端侧执行(compact/echo/goal/permission/plan)。
  - `commands.list` —— `+` 按钮命令面板(官方保留入口,AGENTS.md 铁律点名)。
  - 由于 `SessionRemotes`(remotes.ts:12) 就只要求 `commands`,这个 noop 是**当前唯一一个显式空接**.

### ⬜ 未桥 —— fixture 有实现、zion 没接(桥梁即可解锁,见 §6)

session.create / session.search / session.rename / session.fork(UI占位)
session.updateQueue **真后端**语义
subagent.* (无树 UI)
host.pickDirectory / listDirectory / createDirectory / openPath
workspace.create / rename / delete / insertBefore / insertSessionBefore / archiveSession
skill.list
agentPreset.list / select / read / copy / openDocument / remove
goal.* (无编辑器;fixture 已实现在 rpc 面,只差 UI/桥)
settings.describe / openDocument / update / replace / mutate

### 🧪 仅 fixture 有、真后端可能有差异

- goal.* / credentials.set、unset / llm.discoverModels / settings.update、replace、mutate —— fixture 要么写内存、要么恒返错误、要么返回幻想数据。
- 插件 run(dynamicCordisRunner):**只有真后端能生效**,fixture rpc 面根本不实现(见 §5.3)。

---

## 3. fixture 已实现 vs zion 未接 —— 差值表(MVP 直通量)

fixture 是「B 直拼」的假后端,`FixtureApiClient`(fixture.ts:3039)把 **全部 52 个 RPC** 都 dispatch 到了 `createFixtureWorld().api`(fixture.ts:3074-3132),且 `rpc` 面实现了 `commands/list、commands/execute、goals/*`(fixture.ts:3013-3023)。

**全部 52 RPC 在 fixture 侧都有实现。** 差值是「zion 有没有把对应 UI/接线接到那只 API 上」:

| RPC/功能 | fixture 有实现 | zion 有 UI 触发 | 差值 = 要补的 |
|---|---|---|---|
| session.create | ✅ :2221 | ❌ | 调 manager.create() 即可,fixture 已通 |
| session.search | ✅ :2182 | ❌ | 接搜索请求 |
| session.rename | ✅ :2290 | ❌ | rename 入口 |
| session.fork | ✅ :2311 | ❌ | fork 按钮 |
| workspace.create 等 6 条 | ✅ :2571-2695 | ❌ | 工作区管理 UI |
| subagent.* 4 条 | ✅ :2510-2522 | ❌ | 子代理树 UI(数据空) |
| host 浏览 4 条 | ✅ :2524-2564 | ❌ | 目录浏览器 UI |
| skill.list | ✅ :2780 | ❌ | 技能入口 |
| agentPreset.* 6 条 | ✅ :2698-2777 | ❌ | 预设 picker |
| goal.* 6 条 | ✅ :2792-2830 + rpc 面 | ❌ | goal 编辑器 |
| settings.* 5 条 | ✅ :2895-2927(写=reject) | ❌ | 设置页 |
| credentials.* 3 条 | ✅ :2929-2944 | ❌ | 凭据表单 |
| llm.* 3 条 | ✅ :2946-2963 | ❌ | LLM 设置页 |
| session.updateQueue | ✅(恒返错):2494 | ✅(QueueDock) | fixture 需造 queued 帧,否则其 UI 恒死 |

> 结论:**fixture 直通量 = 52 条里 12 条已被 UI 触发接通(read/prompt 侧)+ 剩余 40 条只要把 UI 接到 manager/api 上即可直通,不必改 fixture。** 只有 `session.updateQueue` 需要 fixture 补数据(否则按钮存在但永远报错)。这就是「先用 fixture 直通」的最大空间。

---

## 4. 命令执行闭环

- 官方把 **slash 命令** 分成两段:
  1. **客户端侧命令服务** —— 通过 `ctx.remote.commands.list` 拉命令面板、`ctx.remote.commands.execute` 本地解析执行(compact / plan / permission / goal 这些客户端命令)。
  2. **host 侧兜底** —— `session.prompt` 里凡是 content 恰为单个以 `/` 开头的文本块,host 会走命令注册表执行、不发模型(sessions.ts:317-322),响应里带 `command` 槽(sessions.ts:353)。
- `commands.execute` payload/返回形状:生成式 Remote `execute(sessionId, line): RpcResult<CommandExecution | undefined>`;fixture 的实现(fixture.ts:1742-1815)把 `/name args` 拆成 name+args,按名分派:
  - `permission` → 改 permission/preset + sandbox/mode + approval/policy 三个事件(fixture.ts:1750-1769)。
  - `goal` → 走 goalRemotes.create / 读当前(fixture.ts:1770-1791)。
  - `compact / echo / plan` → 假动作 + command/run + command/done(fixture.ts:1792-1814)。
  - `CommandExecution = { commandId, result }`,`CommandResult = { kind:'success'|'error', text }`。
- **是否有真实业务命令?Yes —— fixture 的 commandRemotes 不是空壳**,至少 `permission` 和 `goal` 是有真实状态副作用的(改了 projection 事件,permission/goal/plan 面板会联动)。`compact/echo` 是假动作。

- **zion 现状致命点(assemble.ts:26-30):**
  - `noopRemote.commands.execute` 抛错 → 客户端侧命令执行 **硬断**。
  - `noopRemote` 没有 `commands.list` → `+` 命令面板连列表都拉不到。
  - Session(session.ts:359)只在 `session.runCommand` 路径调 `commands.execute`,而 zion 的 sendPrompt 走 `session.prompt → api.sessions.prompt`(不经过 remote.commands),所以**真后端**靠 host 兜底(§5.1)仍能在不接 noopRemote 的情况下执行 `/` 命令;但 **fixture 端** host 兜底不生效(fixture 的 session.prompt 不特判 `/`),所以 fixture 端命令执行被 noopRemote 彻底堵死。

---

## 5. 真后端 vs fixture 差异

| 功能 | 真后端(3080) | fixture | zion 现状 |
|---|---|---|---|
| slash 命令 `/permission` `/goal` 等 | host 侧兜底(session.prompt 内含 `/` 即执行)生效 | host 兜底不生效;只能走 remote.commands.execute(被 noop 堵死) | 真后端可用、fixture 死 |
| 插件 run(dynamicCordisRunner) | 生效(host 有 host half) | **fixture rpc 面不实现,reject** | 已桥,仅真后端可跑 |
| session/jobs 帧 | 真后端发;驱动 job 面板 | fixture 从不发 | 客户端已消费(manager.ts:705),数据仅真后端 |
| settings.update / replace / mutate | 可写(改本地文档/走 seam) | 恒返 settings-rejected 只读(fixture.ts:2913) | 未接 UI;真后端才"生效" |
| llm.discoverModels | 真实探测 provider 端点 | 返自身目录(幻想端点,fixture.ts:2961) | 未接 UI |
| credentials.set/unset | 写真实密钥层 | 只翻内存徽标 | 未接 UI |
| host.pickDirectory/listDirectory | 真实 OS/文件系统 | 确定性假树(fixture.ts:1538-1596) | 未接 UI |
| workspace.create | 把真实目录收编 | 内存假工作区 | 未接 UI |
| host.openPath/agentPreset.openDocument/settings.openDocument | 真开桌面 | 恒 `opened:true` 假成功 | 未接 UI |

> ⚠️ 结论:凡是「探测/写真实资源」的 RPC(settings 写、llm.discoverModels、credentials、workspace.create、插件 run),fixture 要么只读、要么返幻想数据、要么彻底不实现。**这些特性必须在真 3080 上逐项核对**,fixture 只能验证「请求被发出去、UI 不炸」。

---

## 6. 可操作结论 —— 功能接线最小直通清单

按「先用 fixture 直通、再真后端逐项核对」排序。**前 5 条桥完即可让大量功能同时解封**(都是「同一 RPC 面上多个 UI 入口」):

1. **接 `session.create`(一个入口解锁会话新建)**:把 Sidebar.tsx:61 与 AppFrame.tsx:29 的 `{ /* M2 */ }` 改成 `runtime.wire.sessions.create()`(可选 workspaceId)。fixture :2221 已通。→ 解锁:新建会话、首次 prompt 落地。
2. **接 `commands.list` + `commands.execute`(一个 Remote 解锁命令闭环)**:把 assemble.ts 的 `noopRemote` 替换为真 remote——`commands.list` 调 `createWebConnectionRpc('/api','commands/list',{args:{agentId}})`、`commands.execute` 同理(fixture rpc 面 :3013-3014 已实现)。并补 InputBar 的 `+` 命令面板(AGENTS.md 保留入口)。→ 解锁:compact/echo/goal/permission/plan 命令 + plan off + permission-presets 提交(gol 编辑器、plan 面板、permission 面板),fixture 端从"死"变"活"。
3. **接 goal 编辑器(复用同一 goal RPC 面)**:goal.* 6 条 fixture 已有两处实现(fixture.ts:3015-3023 rpc 面 / :2795-2830 api 面);加一个简单的 goal 编辑器调 `manager`/`api.goals.*`(或直接复用 remote 面)。→ 解锁:goal 生命周期;配合第 2 条的 `/goal`。
4. **接工作区管理(workspace.create → rename/delete/insertBefore/insertSessionBefore/archiveSession)**:顶栏工作区已经消费 `workspace.list`(runtime.tsx:152),补 create(打开目录 picker 用 `host.pickDirectory/listDirectory`)与 rename/delete。→ 解锁:多工作区、归档会话。
5. **接 `subagent.list` 于 manager 已有接线**:`refreshSubagents`(manager.ts:347)已全部写好,只差一个 UI 树消费 `snapshot.subagentsByParent`(Sidebar 折叠)。fixture subagent.list 返空(fixture.ts:2511),需补数据才有内容。→ 解锁:子代理目录/历史/prompt/interrupt。

**后续(真后端才验证):** 设置页(settings.* 写)、LLM 设置(llm.providers/models/discoverModels)、凭据(credentials.*)、插件 run(dynamicCordisRunner,仅 3080)、会话导出(downloads)、`session.updateQueue`(真后端有 queued 排程;fixture 需补帧否则 QueueDock 的 steer/remove 恒报错)。

---

### 附:关键文件/行号速查

- 52 RPC 全表:官方 `packages/host/apiproxy/src/api/rpc-map.ts:24-77`
- zion 组装:同一仓库 `renderer/src/protocol/assemble.ts`(noopRemote:26-30;SessionManager 构造:60)
- 插件桥:`renderer/src/plugin/remote.ts:79-96`;编排:`renderer/src/plugin/hub.tsx:42-85`
- runtime 直连:`renderer/src/app/runtime.tsx:142/152/199/204/209/215`
- UI 触发:Sidebar.tsx:61 / AppFrame.tsx:29 / InputBar.tsx:64-78 / QueueDock.tsx:45,50 / InteractionDock.tsx:80,97 / PluginHost.tsx:28-50
- fixture 全实现:`renderer/vendor/client-connection/client/fixture.ts`(api:2179-2996;rpc 面:2998-3028;dispatch:3074-3132)
- fixture 命令:`fixture.ts:1726-1816`;goal rpc 面:`fixture.ts:3015-3023`
- SessionRemotes:`renderer/vendor/client-runtime/client/sessions/remotes.ts:12`(仅 `commands`)
