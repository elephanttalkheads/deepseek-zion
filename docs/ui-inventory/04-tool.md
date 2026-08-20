# G4 工具调用 UI 盘点

> 包：`@deepseek-ai/dsh-client-ui-tool`
> 根目录：`D:\github-Clone\deepseek-harness\packages\client\ui-tool`
> 类型：纯 Client 展示插件（Host 侧 `apply()` 为空）。把已记录的 Tool 调用/结果渲染出来，不改模型请求、不执行 Tool、不订阅 Session 事件。
>
> 拓扑：`ui-conversation` 把每条有序 `tool-call` Conversation Node 分发到 `conversation.chat.node` 的 `tool-call` key；本包渲染其根（`ToolCallTree`）和 Code Dispatch 子节点，再把每个原子调用通过 keyed 的 `tool.call.toolview` slot 分发。未注册的 Tool 名落到通用卡（`GenericToolCard`）。

---

## tool.call.toolview 注册与 key

证明文件：`src/client/apply.ts`（装载全部 toolview plugin）、`src/client/contract/slots.ts`（slot 声明 + `ToolCallOwnerProps`）。

keyed slot `tool.call.toolview`：`{ kind: 'keyed', scope: 'session' }`，owner 载荷 = `ToolCallOwnerProps`。key 域是**开放**的（任意 wire Tool 名，包括业务方自己注册的）；`ToolCallTree` 按 wire tool 名 dispatch，命中则替换，未命中则 fallback 到 GenericToolCard（**不是共享**——命中即完全接管）。key 拼错就永不渲染。

每个 toolview 都以独立 registrant plugin 形式注册：`ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name:'tool.call.toolview', key:'<wire名>', locale: CONVERSATION_NS }, Component))`，dispose 由 `slots.register` 内 `ctx.effect` 处理。

**本包注册的 key（10 个 key / 8 个组件）：**

| key | 组件 | 渲染内容 | 数据源 | 文件 |
|---|---|---|---|---|
| `bash` | `BashRow` | 图标+`Bash · {description}` 摘要行，整行折叠。展开体：命令 + cwd + 输出 + 退出码/信号 的 `TerminalBlock`（`maxLines=Infinity` 不折叠）；执行失败且无 terminal 材料时用 IN/OUT 通用卡。运行态保持图标、CSS sweep 指示 in-flight；error=红点、stopped=琥珀点。错误行折叠摘要=失败首行（错误色）。折叠/展开走独立复刻的 ToolRow 交互（整行为 toggle，Enter/Space，icon→chevron 悬停预览）。**不**复用 `ToolRow`，而是自行实现（registrant posture）。 | `toolRowModel`（参数摘要/分类）+ `terminalCardModel`（command/cwd/output/exitCode/signal，cwd 经 `resolveWorkspacePath` 对 session cwd 解析）+ `terminalFailed`。模型来自 `block.callView`（运行）与 `block.resultView`（结果）的 `card:'terminal'`。 | `tool/toolviews/bash-sample.tsx` |
| `read` | `ReadRow` | 图标+`Read · {path}`，整行折叠。展开体：文件带行号、语法高亮的 `ReadBlock`（`CHAT_READ_MAX_LINES=8` 折叠中部）。摘要路径是 host 可打开的**路径链接**（`onOpenFile`）。运行中 read（结果未到）只渲染摘要行（read intent 是 result-side only）。 | `toolRowModel` + `readCardModel`（label=resultView.title ?? 相对 cwd 的 path；lines/totalLines/lang 来自 `block.resultView.card:'read'`）。复用共享 `ToolRow`。 | `tool/toolviews/read-row.tsx` |
| `edit` | `FileMutationRow` | 图标+`Edit · {path}`，整行折叠。展开体：应用后的 diff 的 `DiffBlock`（`CHAT_DIFF_MAX_LINES=8`）。摘要=路径链接。错误变更无 diff 卡→ToolRow 的 Output 段显示错误文本、折叠摘要=首行。 | `toolRowModel` + `diffCardModel`（resultView 的结果 hunks 优先级高于 callView 的参数派生 hunks；`kind:'diff'`）。复用 `ToolRow`。 | `tool/toolviews/file-mutation-row.tsx` |
| `write` | `FileMutationRow` | 同上（`Write · {path}`，图标同为 Edit 家族）。 | 同上。 | `tool/toolviews/file-mutation-row.tsx` |
| `grep` | `SearchRow` | 图标+`Grep · {summary}`，整行折叠。展开体：`SearchBlock`，按 `kind` 显示分组 matches 或 路径列表（`CHAT_SEARCH_MAX_LINES=8`）；capped 时卡下方显示 recovery 定位页脚。摘要用 resultView 的替换 title。settled 无卡（错误/嵌套 run_code/legacy）→ Output 段。 | `toolRowModel` + `searchCardModel`（result-only，`block.resultView.card:'search'`；shape matches/paths 之分）。复用 `ToolRow`。 | `tool/toolviews/search-row.tsx` |
| `glob` | `SearchRow` | 同上（`Glob · {summary}`）。 | 同上。 | `tool/toolviews/search-row.tsx` |
| `web_search` | `WebRow` | 图标(globe)+`Search · {summary}`，整行折叠。展开体：`WebBlock`（kind:'search'：answer + sources 列表[{url,title,snippet,publishedAt}] + truncated）。运行中无 web 卡→摘要行。 | `toolRowModel` + `webCardModel`（result-only，`block.resultView.card:'web'` kind:'search'）。复用 `ToolRow`。 | `tool/toolviews/web-row.tsx` |
| `web_fetch` | `WebRow` | 图标(browse)+`Fetch · {summary}`，展开体：`WebBlock`（kind:'fetch'：url + statusCode + truncated）。 | `webCardModel` kind:'fetch'。 | `tool/toolviews/web-row.tsx` |
| `todo_write` | `TodoRow` | 图标+`todo.rowTitle`，摘要=完成计数+首个 in_progress 项+非收缩的 `+N` 并行计数后缀（summarySuffix）。整行折叠进出 Input/Output。 | `toolRowModel` + `planSummary`（从 call args 的 `todos[]` 数 done/total/active）。复用 `ToolRow`。 | `tool/toolviews/todo-row.tsx` |
| `ask_user_question` | `AskQuestionRow` | 图标+`ask.rowTitle`，摘要=交互结果：`waiting`(运行中)、`answered N/total`(settled 去重计数)、`cancelled`(ASK_CANCELLED)、`interrupted→stopped`(ASK_ABORTED)。问题本身在 composer takeover 渲染，此处只剩结果行。 | `toolRowModel` + call/result 的 `block.error?.code` + result 文本 JSON `answers[]`。复用 `ToolRow`。 | `tool/toolviews/ask-question-row.tsx` |

**本包之外、由其它业务包注册的 key（README 声明）：**
- `skill` → `ui-skill` 包业务注册（demo）。
- `cordis_define` → `ui-cordis` 注册的 keyed toolview（本包 `TOOL_VARIANTS` 中**刻意缺**，因为 keyed 命中会替换通用行，表里放会不可达）。
- key 域对任意 wire Tool 名开放，可继续加。

---

## 工具主卡/树

| 组件/文件 | 渲染内容 | 数据源 | 备注 |
|---|---|---|---|
| `ToolCallTree.tsx`（`conversation.chat.node` 的 `tool-call` key）| 递归渲染一个根 `ToolCallBlock` 及所有子调用。每个原子调用包一层 `data-chat-anchor-key="call:<id>"` / `data-chat-call-id` / `data-selected`，通过 `renderSlot('tool.call.toolview', owner, {entryKey:toolName, fallback:GenericToolCard})` 分发。子调用递归嵌套在 `data-subcalls` 容器。 | `node.data.root`（已含递归 `subCalls`）、selection state、session cwd、openFile/inspectCall Host 回调。所有 props 都来自 slot 运行时（`PropsRuntime`）。 | 每级都走同一条原子分发路径；**无独立 parent→children map**。 |
| `ToolCall.tsx`（ToolCallTree 内部 memo）| 单个原子调用的分发包装：构造 `ToolCallOwnerProps`（callId/toolName/block/openFile/cwd/inspect），渲染 keyed slot + children。 | 同上。 | `callName()` 从 `kind in node ? node.call?.name : node.name` 取 wire 名。 |
| `ToolCallBranch.tsx`（内部）| 递归子树：有 subCalls 时包 `data-subcalls` 容器递归渲染子分支。 | 递归投影 `block.subCalls`。 | — |
| `GenericToolCard.tsx`（keyed slot 的 **fallback**，即通用 tool 卡）| 把任意未注册 Tool 名分类为 7 种 variant——`search`/`read`/`bash`/`write`/`edit`/`code`/`others`——并渲染 summary 行，可选携带 terminal/diff/read/search/web 卡（每一调用最多一个卡 kind，互斥）。`code` variant 展开体是 `CodeBlock`(shiki, lang=typescript)程序，其余用 IN/OUT 卡。单文件工具摘要是路径链接。 | `toolRowModel`（variant 分类+摘要+body+output+errorSummary+state+filePath）+ 各 card model。 | variant 图标表：search=🔎/read=浏览/bash=API/write=编辑/edit=编辑/code=代码/others=✨。这是 keyed 分发 miss 的着陆点。 |
| `ToolRow.tsx`（共享行 chrome，非 toolview，被 4 个卡行 + generic + todo + ask 复用）| 单行 Tool 摘要（figma 122:9479）：16px leading（state dot/工具图标，展开或悬停→chevron）+ title + 分隔点 + FILL 截断的 summary。整行为展开 toggle（click/Enter/Space），折叠常为一行；凡有 body/output/卡即 expandable；展开时 summary 保持 inline。展开体在 max-height 滚动容器内；卡片 kind 互斥选择 `TerminalBlock`/`DiffBlock`/`ReadBlock`/`SearchBlock`/`WebBlock`；文本走 IN/OUT gutter 卡；`code` variant 走 CodeBlock。折叠初始，运行串保持可扫读。摘要后缀（todo 的 `+N`）在非收缩 span；错误行折叠摘要=失败首行；文件摘要为路径链接（stopPropagation 隔离）；展开体右上悬停 Inspect 药丸。`data-variant`/`data-tool`/`data-state` layering。展开态是组件本地 view state。 | props：icon/title/summary/summarySuffix/body/output/errorSummary/terminal/diff/read/search/web/state/filePath/onOpenFile/inspect + t(conversation locale)。 | 运行态=CSS sweep（`data-state`），StateDot 是 aria-hidden，所以有视觉隐藏文本标签。 |
| `ToolDetails.tsx`（`conversation.details.tool`）| 详情面板里所选 Tool 调用的结构化输出：按顺序试 terminal→read→diff→search→web 卡 model，命中则渲染对应 primitive 卡；全部 miss→运行中显示 `details.running`，settled 显示扁平结果文本 `resultText`（`data-error` 标记错误）。 | 各 card model 复用同一套纯模型；`resultText` 展平 content blocks。 | 卡行与 details 共享同一批纯卡模型（terminal/read/diff/search/web）。 |

---

## 其它

- **数据边界与来源**：所有展示数据都来自 frozen `ToolCallBlock`（`RunningToolCall` 运行态 / `ToolResultNode` settled 态，二者形如 `kind in node` 判别）。调用侧提供 wire 名、参数、callView；结果侧提供 content、error、resultView。**演示代码不读 Session service**；cwd 相关解析（terminal cwd、路径相对化、openFile 打开）只在用户触发 Host `openFile` 回调时才做。呈现层从不 `JSON.stringify`/复制运行时 live 对象，只取所需叶子字段。
- **纯模型层（`tool/models/`，派生一次、两处复用——chat 行展开体 + details 面板）**：
  - `terminal-card-model.ts`：`card:'terminal'` → `TerminalBlock` 的 command/cwd/output/exitCode/signal/running；`terminalFailed`（非零退出/信号 = 折叠行唯一的失败信号，bash tool 以 isError:false settle）；`resolveTerminalCwd`/`normalizeSegments` 把相对/省略 cwd 对 session 根解析并折叠 `.`/`..`。
  - `read-card-model.ts`：result-only `card:'read'` → label/lines/totalLines/lang；`CHAT_READ_MAX_LINES=8`。
  - `diff-card-model.ts`：`card:'diff'` → diffs（结果 hunks > 调用派生 hunks）；`narrowDiffs` 防御 wire 数据；`CHAT_DIFF_MAX_LINES=8`。
  - `search-card-model.ts`：result-only `card:'search'` → matches/paths；capped 时 recovery 定位页脚；`CHAT_SEARCH_MAX_LINES=8`。
  - `web-card-model.ts`：result-only `card:'web'` → kind search(答案+sources)/fetch(url+status)。
  - `tool-call-model.ts`：`classifyTool` variant 表（含 pwsh/run_code/cordis_*）、`VARIANT_TITLES`、`TOOL_TITLES`（如 `pwsh:'Pwsh'`、`cordis_run:'Run Cordis Plugin'`、`cordis_package_inspect:'Inspect'`）、`SUMMARY_KEYS`、`relativizeToCwd`、`deriveSummary/Body/FilePath`、`resultText`、`toolRowModel`。**（复用 ToolRow 的业务行之外的 `cordis_*`/`run_code` 未注册 keyed toolview，走 GenericToolCard fallback。）**
- **`tool/toolviews/plan-summary.ts`**：todo_write 行的 done/total 计数 + 首个 in_progress 项 + 并行 `+N`（named 规则与 tool 自身一致）。
- **locale**：`CONVERSATION_NS = 'conversation'`，复用 `ui-conversation` 的 locale 命名空间；`terminalBlockLabels` 是唯一把 primitive 标签面与本包词典配对的地方（chat 行、bash 行、details 共用）。
- **属性面板集成**：`ToolDetails` 挂在 `conversation.details.tool`，是单调用全高阅读面（与流程内折叠行互补）。
- **DOM 契约**：每一级包装保留 `data-chat-anchor-key="call:<id>"` 与 `data-chat-call-id`，用于分页与选择。
- **CSS module 文件**（可见样式）：`ToolCallTree.module.css`（callRow/subCalls）、`ToolDetails.module.css`（description/cardBody/read/recovery/web/empty/code）、`tool/components/ToolRow.module.css`、`toolviews/bash-sample.module.css`（bash 行独立复刻，未复用 ToolRow.css）。声明在 `src/css-modules.d.ts`。

### 容易被遗漏的交互（重建 demo 时注意）
1. **整行为折叠 toggle**：不是只点 chevron——点整行、Enter、Space 都展开；运行态图标保留而错误/停止态换成 StateDot（红/琥珀）。
2. **折叠默认 + 运行串可扫读**：每个卡 kind 初始折叠，展开体在 max-height 滚动容器内（细节面板才是全高阅读面）。
3. **中部折叠的 maxLines 差异**：chat 行用 CHAT_*_MAX_LINES=8（read/diff/search），terminal 在行内 `maxLines=Infinity`（bash 行也是），details 面板保 primitive 默认（不限）。
4. **摘要路径链接（file tool）**：read/write/edit 摘要是可点击的 host 打开链接，`stopPropagation`/keydown `stopPropagation` 隔离于行 toggle。
5. **折叠/展开的 icon→chevron 悬停预览**：有 hover 预览，展开态是 chevron-down。
6. **错误行的摘要替换**：折叠摘要整体变成失败首行（错误色），并在此态禁用路径链接与 summarySuffix。
7. **Inspact 药丸**：展开体右上只在 `inspect` 回调存在时显示，hover 显现，跳到 trajectory 视图。
8. **摘要 suffix 非收缩**（todo `+N`）：窄行先剪正文再剪计数，渲染在独立 span。
9. **运行 sweep 是颜色/CSS-inflight**，StateDot 与 sweep 都 aria-hidden → 有视觉隐藏的文本状态标签（row.running/failed/stopped、bash.running 等）。
10. **bash 行是独立复刻**而非复用 ToolRow：改动 ToolRow 交互时 bash-sample 需同步。
11. **capped search 的 recovery 定位页脚**只在原始 result 文本里（卡替换了原文），所以单独渲染在卡下方。
12. **`ask_user_question` 的问题 UI 在 composer takeover**，行上只剩结果摘要（waiting/answered/cancelled/interrupted）——别以为行里画问题。
13. **keyed dispatch 完全接管**：命中 key 就不再渲染 GenericToolCard；未注册 key 才走通用分类行（含 pwsh、run_code、cordis_* 系列）。
