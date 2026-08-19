# DeepSeek Zion 交接文档(Handoff)

> 交接时间:2026-08·会话后半(UI 功能入口差距补齐轮)。交接人:deepseek-v4-flash on DSH。接任对象:**本机新会话**(继续「补差距」)或 clone 本仓库的任意 agent。
> 本文件是接任**首要必读**入口;重复内容一律指向既有文件:`SYNC.md`(官方更新同步)、`CONTEXT.md`(领域词表/红线)、`docs/ui-entry-gap-inventory.md`(UI 入口差距执行索引)、`docs/real-backend-only-verification.md`(真后端专属项核验 + 400 归因)、`renderer/M1-验收记录.md`。

---

## 0. 一句话项目定位与当前状态

`deepseek-zion` = DeepSeek Harness(DSH)的桌面 GUI:**自建 React 18 + Vite 复刻 renderer,数据层直接用官方纯类(B 直拼),插件底座承接 community 插件**;零 cordis 装配,`/api` proxy 直连真后端(3080)。

**当前阶段(本会话主线)**:功能接线收尾(已完成)→ **真后端专属项核验(26/26)** → **UI 功能入口差距补齐(进行中)**。目标:`官方 UI 可点的入口在 replica 中全部存在且可用`,每项以官方 3080 为基准、探针验证、真后端可操作。

**进行中的 goal(已恢复,round 5/30)**`:goal-284dc56d`(max 30 轮)。objective:①②③④⑤ 五类差距补齐(见 §3)。已完成的核验/补齐:
- ① TrajectoryView ✅ real 6/6 + fixture 10/10
- ② 设置界面(壳+通用+Provider 编辑)✅ real 11/11 + 10/10
- ③ dynamicCordisRunner 运行编排 UI ✅ real 7/7
- P1 模型两级菜单 ✅ real + fixture 7/7
- P1 **权限三面 + Plan chip** ✅ fixture 12/12 + real 12/12(本轮)
- P1 **信息层三件套(ContextMeter / StatsLine / TodoDock)** ✅ fixture 6/6 + real 7/7(本轮)
- P2 **会话行 … 菜单 + 视图选项菜单** ✅ fixture 8/8 + real 8/8(本轮)
- P2 **拖拽重排 + 溢出展开** ✅ fixture 6/6 + real 6/6(本轮)→ **P2 全清**
- ⑤(部分) 消息复制/分支 ✅ real 6/6
- ④ 会话导出按钮 → **已核定为 N/A**(官方 web 客户端无该按钮,`downloads` 是 host-only 通道;见 §3)

---

## 1. 最近提交链(自本会话;`main` 最新行在前)

| 提交 | 内容 |
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
- 数据层 = 官方纯类 B 直拼:`renderer/vendor/`(现 **10 包+类型占位**)由 Vite 直编;装配 `protocol/assemble.ts`;React 侧 `app/runtime.tsx` 用 `bindSnapshotSelector`.
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
- **vendor 包现状**:`client-connection / client-runtime / client-ui-conversation / client-ui-slots / client-web-react / ui-primitives(最小面:icons 全表 + Tooltip + JsonTree/MarkdownText/Toast/plain-text + Menu/Button/Modal/RiskConfirmation/pointer-grace)/ ui-trajectory(完整)/ ui-model-selection(完整)/ ui-plan(完整)/ ui-permission-presets(完整)/ schema-form(完整)+ ts-types`.alias 与 paths 均已配好,后续 vendor 新包照抄;npm 依赖另加 `@deepseek-ai/schemastery`(file: 官方链,schema-form 需要).
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

Goal 暂停;恢复时按下列优先级继续补官方可点入口,每项照 §2 的 vendor 流程 + 探针验证:

- **P1(已完成)**:`/permission` Full access 风险确认 + 权限默认行 + composer 权限 chip;Plan chip(`/plan off`)。→ `/permission` 命令的 **popupSelect 装饰**随 P3 MenuView 一并接入(裸行已在命令面板)。
- **P1**:ContextMeter 上下文环 / TodoPanel / StatsLine(需绑 `useProjection('contextPressure'/'contextBreakdown'/'todos'/'sessionStats')`,参考现有 `useGoal` 绑定)。
- **P2**:QueueDock **edit 行内编辑**(已有 steer/remove+真后端 queued 验证);工作区视图选项菜单;会话行 … 菜单(重命名/归档)。
- **P3**:审批/提问 composer 接管式(InteractionDock 现为旁路卡,官方替换 composer);`/` `@` 触发菜单 MenuView + popupSelect;附件 Lightbox/拖放;反馈赞踩+备注;JobListAction。
- **P4**:Agent 预设四表面;Miller 目录浏览弹窗;子代理目录树 + 只读 composer;skill 行;workflow-run/deliverables 面板。
- **N/A(不必做)**:会话导出按钮(官方无 UI);DetailsPanel(官方未接线);native 目录流(renderless)。

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

*本文件由原开发会话持续维护;信息截至 `6fa73d5`(拖拽重排 + 溢出展开)。接手后有重大变化请同步更新 §1/§3 并按 AGENTS.md 记录。*
