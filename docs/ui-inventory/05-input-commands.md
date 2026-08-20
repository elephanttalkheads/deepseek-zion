# G5 输入触发/命令/技能/子代理盘点

> 范围：`ui-input-trigger`、`ui-commands`、`ui-skill`、`ui-subagent` 四个 client 包。
> 这些包共同构成 DSH Web 的**`/` 与 `@` 输入触发管线、命令菜单/执行、技能引用、子代理（@ 引用 + 目录面板）**。
> 数据通路速览：
> - `/` 与 `@` 在两个 `InputTriggerSource` 上注册（`ctx.inputTriggers.registerSource`），由 `InputTriggerController` 每会话驱动。
> - 触发菜单 `MenuView`（ui-input-trigger）与 popupSelect 外壳 `PopupSelectView`（ui-commands）**共同注册到同一个 `conversation.input.overlay` slot**（kind: list, scope: session，锚点在 ui-conversation 的 InputBar composer 卡片内）。
> - 面板类 slot：`conversation.session.header.actions`（子代理目录）、`conversation.composer`（只读 composer 接管）、`tool.call.toolview`（keyed，技能工具行）。
> - 命令执行结果**行卡片**（`conversation.chat.commandview` keyed slot）实际由 **ui-conversation** 拥有（CommandNodeView / GenericCommandCard / CompactionCommandCard），本四个包只产生触发与执行，不渲染该行——重建 demo 时需跨到 ui-conversation。

---

## 包：ui-input-trigger

**职责**：输入触发核心管线。纯核心在 `src/core/`（无 React/DOM/cordis），`src/client/service.ts` 是壳，`MenuView` 是唯一可见组件。

### 组件清单

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/MenuView.tsx`（**触发候选菜单**） | 触发候选下拉列表（listbox）：按 source 分组，每组一条 `groupTitle` 标题行 + 若干 `option` 行。option 行 = 可选 icon（`item.icon`，当前按文本原样渲染）+ `name` + `description`。group 未就绪时显示 `loading` 行（"正在加载…"）。高亮行 `role=option aria-selected`，`aria-activedescendant` 方案（焦点留在 textarea，mousedown 选行）。底部锚定、高度钳制在 MAX_HEIGHT=320px 与上方空间之间 | `InputTriggerController.menu`（`SnapshotStore<MenuState>`），由 `candidates()` 每代拉取各 source；标题文案走 `inputTriggers.menu` locale 命名空间 | **`conversation.input.overlay`**（kind: list, session；由 ui-conversation 声明锚点，本包做 SlotMap 类型 merge） | `/` 与 `@` 的候选都汇到这里，按 `InputTriggerSource.order` 排序分组（命令→subagent→技能? 实际 / 下有 command、skill 等）。关闭时渲染 null；外部指针（不在菜单也不在 composer 卡片 `[data-composer-card]`）点击即关闭 |
| `src/client/service.ts`（`InputTriggerService` = `ctx.inputTriggers`） | 无可见 UI（管线服务）：source 注册表 + 每会话 `InputTriggerController` 惰性解析；`toggleSource` 供 chrome 启动器（如某按钮触发的命令面板）打开唯一 source | source 注册（`registerSource`）、`sessions.scopeOf` | — | 等价于一个"命令启动器"的程序化入口：合成的 selection span 复用普通菜单/pick/输入变更管线，`launcher` store 发布当前 source 名。配 `static inject=['sessions']` |
| `src/client/controller.ts`（`InputTriggerController`） | 无可见 UI（每会话状态机）：`track`（draft/caret 探测）→ `arbitrate`（↑↓/Esc/Enter）→ `onSpace`/`adjudicate`（空格/回车判定）→ `pick`（指针选择）；持有 `menu`、`launcher`、`lexicon` 三个 `SnapshotStore` | roster（`sources(trigger)`/`all`）、source 回调（`warm`/`candidates`/`onPick`/`matchSpace`/`matchEnter`/`lexicon`/`subscribeLexicon`/`codec`） | — | Pick 结果经 scoped 事件 dispatch：`slash/input-begin-command`（claim）、`slash/input-insert-text`（text）、`slash/input-insert-reference`（insert） |
| `src/core/menu.ts` | 无 UI（纯 reducer）：`menuReduce`/`seedGroups`/`MENU_CLOSED`/`exactMatch`；group 状态 pending/ready/failed，空 ready 组自动关闭 | — | — | 决定菜单"分组标题+加载行+高亮循环"的渲染模型 |
| `src/core/detect.ts` | 无 UI：word-boundary + guard-tier 的 `/` `@` 探测 | — | — | 决定何时弹出触发菜单（leading/midline 位置、guard 层级） |
| `src/client/locales.ts` | 命名空间 `inputTriggers.menu`：组标题 `command→命令/命令`、`skill→技能/Skills`、`subagent→子智能体/Subagents`、`loading`、`suggestions.aria` | — | — | 未知 source 标题回退为原始 name |
| `src/client/slots.ts` | Type-only SlotMap merge：声明 `conversation.input.overlay: {kind:'list'; scope:'session'}` + `MenuViewInjected{menu,onPick,onDismiss}` | — | — | 锚点/生命周期归 ui-conversation；类型归属本包 |

**触发路径 / 路由**：textbox 输入 `'/'`/`'@'` → `detectTrigger` 命中 → `track` 记录 span → 各 source `candidates()`（generation-gated、AbortSignal 中止）→ `menu` store 更新 → MenuView 弹出 → 键盘/指针选择 → `pick` 调 `onPick` → claim/text/insert outcome → scoped 事件改写输入。

---

## 包：ui-commands

**职责**：客户端命令 API（`ctx.commandUi`）、`/` 命令 source（matchSpace/matchEnter 判决）、popupSelect 外壳、命令执行。可见组件 = 命令菜单（借 trigger 菜单渲染）+ **popupSelect 外壳**。

### 组件清单

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/PopupSelectView.tsx`（**popupSelect 外壳**） | 命令选择卡片（overlay）：顶部 `search` 输入框（取得焦点，本地过滤），状态条（pending "正在加载选项…" / submitting "正在应用…" / empty "无选项"），错误条（`role=alert` 错误文案 + 失败时 `retry` 按钮），选项列 `role=listbox`，每行 = `label` + 可选 `detail` + 可选 `check`（`IconCheckOutline16`，当 `option.active`）。键盘 ↑↓/Enter/Esc 驱动；卡片外点击关闭。MAX_HEIGHT=320。可叠加**风险确认** `RiskConfirmation` 弹层（confirmation.title/description/acknowledge/cancel/confirm + checkbox） | `PopupSelectController.state`（`SnapshotStore<PopupState>`：open/command/status/options/search/active/submitting/confirming/acknowledged/error）；options 由 `CommandUiSpec.options()` 加载一次，本地 `filterOptions` 过滤 | **`conversation.input.overlay`**（id `command-popup`，order 1，与 slash 菜单同 slot） | 与 slash 菜单不同：**此壳持有焦点**（非 combobox）。由 `register`/`decorate` 的 popupSelect spec 打开，`onSelect` 后 `consumeTokenSegment` 消费 token + `focusComposer` |
| `src/client/popup.ts`（`PopupSelectController`） | 无 UI（headless 外壳状态机）：`open`、`setSearch`、`move`、`highlight`、`select`（单飞）、`acknowledge`/`cancelConfirmation`/`confirm`（风险门）、`dismiss`、`retry`, `dispose`；`filterOptions` 纯函数 | `PopupSpec{options,onSelect}` + open 时 context + `TokenSegment`（menu span / enter 裸 token） | — | 成功 settle 后经注入 `consume(segment)` 回调 dispatch `slash/input-consume-token` 事件 |
| `src/client/service.ts`（`CommandUiRuntime` = `ctx.commandUi`） | 无可见 UI（命令 source/目录/注册表/执行） | `command.list({sessionId})` Remote RPC（`ctx.remote.commands.list`）；`warm` 预取；`commands/change`、`agent-preset/selected`、`connection/reset` 失效事件；自定义命令来自 `register`/`decorate` | — | `/` source `name:'command'`。candidates = host 目录 + 客户端贡献，fuzzy 排序（`fuzzyScore`/`fuzzyCandidates`，前缀最先）。三态 dispatch：host 带 `input` → **leadingInput claim**（`/name ` + `command.execute` 事务）；`CommandUiSpec` → **popupSelect**；其余 → **execute**（detached run）。`matchSpace` 热键同步 claim；`matchEnter` 强等目录。执行成功发本地 `command/executed` 事件 |
| `src/client/directory.ts`（`CommandDirectory`） | 无 UI（每会话命令目录缓存）：session-keyed、cold/pending/ready/failed、single-flight、epoch 守卫 | `command.list({sessionId})`；subagent 地址返回空（不激活子代理） | — | `resolve`（同步精确名）、`ensureReady`（强等下 Enter）、`warm`、`invalidateAll`、`resetConnected` |
| `src/client/contract.ts` | Type-only 契约：`SelectOption{id,label,detail?,active?,confirmation?}`、`SelectConfirmation`、`CommandUiSpec{kind:'popupSelect'; options; onSelect}`、`CommandContribution`、`CommandDecoration`、`CommandUiContract{register,decorate,popupFor}` | — | — | 业务包只消费 `register`/`decorate`；外壳归本包 |
| `src/client/locales.ts` | 命名空间 `command`：`search.placeholder/aria`、`status.loading/applying/empty`、`overlay.aria`、`listbox.aria` | — | — | popupSelect 外壳文案 |
| `src/client/index.ts` | 无 UI（插件体）：注册服务 + 字典 + 把 PopupSelectView 注册进 `conversation.input.overlay` | — | `conversation.input.overlay` 注册 | `inject=['inputTriggers','sessions','remote','remote.commands','locale']`；slot `id:'command-popup'`, `order:1` |

**命令执行预览 / 执行**：
- `leadingInput` quite（带 `hint`）：选中后在 draft 填入 `/name ` 并等待参数，提交走 `command.execute`。
- popupSelect：打开外壳选择选项，`onSelect` 提交。
- 裸 execute（fire-and-forget）：直接调 `command.execute`，结果不在此包渲染——**渲染为持久 flow 节点（`conversation.chat.commandview` keyed slot）由 ui-conversation 拥有**（GenericCommandCard / CompactionCommandCard / CommandNodeView），本包只发 `command/executed` 事件并可监听以做浏览器侧副作用。

---

## 包：ui-skill

**职责**：技能调用入口（`/` `skill` source）+ 技能工具行（`tool.call.toolview` keyed）。可见组件 = 技能菜单行（借 trigger 菜单）+ **技能工具行卡片**。

### 组件清单

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/SkillRow.tsx`（**技能工具行**） | 一条技能调用行（`[data-tool=skill]`）：折叠态 = 前导图标（14px `IconSkillOutline16`，error 用 `StateDot error`、stopped 用 `StateDot warning`，hover/展开显示 `IconChevronDownOutline14`）+ 视觉隐藏生命周期文案（"正在加载 skill"/"加载失败"/"加载已中止"）+ 标题 `Skill` + 分隔符 + 技能名（error 时替换为错误首行）。展开态（whole-row disclosure）= `Instructions` 卡片（`pre` 输出）+ 可选 `Inspect` 按钮（`IconInspectOutline12`，调 `inspect`） | 仅派生自 ui-tool 提供的 frozen call/result 切片（`ToolCallViewProps.block`：callId/argsRaw/output/error/state），**不查当前技能目录**（replay 稳定） | **`tool.call.toolview`**（keyed, key=`skill`） | 生命周期 state 派生：running/ok/error/stopped（`interrupted`→stopped）。`resultText` 与 ui-tool 的 `tool-call-model.ts` 对齐 |
| `src/client/index.ts`（source + 注册） | 无 UI：注册 `/` `skill` source + 技能工具行 + 字典 | `skill.list({sessionId})` Remote RPC（`connection.api.skills.list`）；每会话 single-flight 缓存；`agent-preset/selected`、`connection/reset` 失效；catalog-addressed children 返回空 | `tool.call.toolview`（keyed skill）；source 进 `ctx.inputTriggers` | `inject=['inputTriggers','connection','sessions','slots','locale','remote']`。candidates 过滤 `startsWith(query)`；`modelInvocable:false` 的技能 description 前缀 "仅用户 ·"（`menu.userOnly`）。pick 落地 `/{name} ` 字面量；deliberate precedence：与 host 命令同名时命令优先（adjudication 先 claim）。实现 `lexicon`/`subscribeLexicon` 供 draft chip 视觉 |
| `src/client/locales.ts` | 命名空间 `skill`：`row.running/failed/stopped/instructions`、`menu.userOnly` | — | — | 工具行 + 菜单 user-only 标记文案（`NS='skill'`） |

**/skill 触发路由**：`/` 输入 → trigger 菜单（MenuView）出现 `Skills` 组 → pick → 字面量 `/name `；第 host 端 pre-step boundary（`dsh-tool-skill`）识别消息内外 `/name` 并把渲染的 `<skill_content>` 注入步骤（所有入口一致，含 `disable-model-invocation`）。技能调用在 transcript 中渲染为 SkillRow。

---

## 包：ui-subagent

**职责**：`@` 子代理引用 source + 会话头部的**子代理目录面板**（二级会话树）+ 只读 composer 接管。可见组件 = 目录触发按钮 + 目录树 + 只读 composer。

### 组件清单

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/SubagentCatalogAction.tsx`（**子代理目录触发按钮 + 树面板**） | 会话头部一个触发按钮：活动槽（运行中显示 `StateDot ongoing`）+ 计数文案（"N 个子代理"或"N 个子代理，正在运行"）+ `IconChevronDownOutline14`。点击展开 `role=tree` 菜单（`aria-label="子代理会话"`），逐层渲染 `CatalogRows`：每行 `role=treeitem` = 展开按钮（`IconChevronRightOutline14`，leaf 无箭头但保留箭头列若该层有分支）+ `StateDot`（running→ongoing/done）+ label + 次级行（title · mode · activity）+ 尾部 metrics 列（token 合计 `X.XK tok` + 活跃时长，时长精度按规模递减，hover title 给精确秒）。展开分支时先预留每条已知后代的 disabled `loading` 行（"正在加载子代理…"），再惰性替换为权威目录；错误态显示错误文案 + `retry` 按钮；diagnostic 行（corrupt/unsupported/unavailable）显示为 disabled 并可读 | `useSessions`（`sessions.list` store）：`subagentsByParent`（目录快照）与 `byId`（`SessionSummary`：projectionValues.{tokenUsage, subagentTiming, parentId, title, running, origin}）；token 四桶求和；`indexSubagentDescendants` | **`conversation.session.header.actions`**（id `subagent-catalog`, order 10） | 目录树为 direct-catalog 权威，story 懒加载。选择任意深度调 `openChild({parentSessionId, childSessionId, mode})`（=`sessions.openSubagent`）。活动时长每秒推进（仅运行中 child），冻结于 inactive。可见性需 evidence（entries/descendants/error） |
| `src/client/SubagentReadOnlyComposer.tsx`（**只读 composer**） | `role=status` 只读提示条：`<strong>` 标题 + 解释 body。两种情况：`one-shot`（"一次性子代理记录"/"一次性任务不支持后续消息，可在这里查看完整执行记录"）；`parent-unavailable`（"此子代理暂时只读"/"父会话当前不在线，重新打开父会话后即可继续发送消息"） | `owner.session.subagent`（address.mode + parentAvailable + running）；selector 逻辑在 `index.ts` 的 `selectReadOnlySubagent` | **`conversation.composer`**（priority -10, `select`） | 一次性 child 永远只读；可继续 child 仅当父不可达且未运行时才接管（运行中保持普通 composer，输入端禁用但 Stop 可用；停止后接管回来）。父可达时可继续 child 用普通 composer，follow-up 入 FIFO inbox |
| `src/client/index.ts`（`@` source + 注册） | 无 UI：注册 `@` `subagent` source + 两个 slot + 字典 | `sessions.list.getSnapshot()` 的 `byId`（零 RPC）：`parentId===sessionId && running && displayTitle.includes(query)` → label；`subscribeLexicon` = sessions.list.subscribe | `conversation.session.header.actions`、`conversation.composer`；source 进 `ctx.inputTriggers` | `inject=['inputTriggers','sessions','slots','locale']`。pick 落地 `@{label} ` 字面量；有 `codec`（clipboardText/serialize 目前都返回 `@{ref}`）但**无 adjudication hooks**（@ 引用不进命令判定）。运行中子代理 source 候选 + 目录导航 |
| `src/client/locales.ts` | 命名空间 `subagent`：`diagnostic.*`、`duration.*`（秒/分/时/天/月/年 + exact）、`loading.label/aria`、`load.error`、`retry`、`mode.oneShot/continuable`、`activity.running/inactive`、`branch.collapse/expand`、`count.total.one/other`、`count.running.one/other`、`tree.aria`、`readonly.*` | — | — | `NS='subagent'` |

**@ 引用路由**：输入 `@` → trigger 菜单（MenuView）出现 `子智能体` 组 → pick → 落地 `@label ` 字面量（plain-text reference，随普通 prompt 发送）。子代理原始会话行**不在侧边栏**出现，父头部目录是导航入口；普通 fork 仍在侧边栏。

---

## 汇总与易遗漏点

**各包可见组件数**
- ui-input-trigger：**1** 个可见组件——触发候选菜单 `MenuView`（含 loading 行、分组标题、icon/name/description 行）。
- ui-commands：**1** 个可见组件——popupSelect 外壳 `PopupSelectView`（search 框、状态/错误条、选项列 + check、风险确认 RiskConfirmation）。
- ui-skill：**1** 个可见组件——技能工具行 `SkillRow`（折叠摘要 + Instructions disclosure + Inspect）。技能的 `/` 菜单条目借 trigger 菜单渲染。
- ui-subagent：**2** 个可见组件——子代理目录触发按钮 + 懒加载树 `SubagentCatalogAction`、只读 composer `SubagentReadOnlyComposer`。`@` 菜单条目借 trigger 菜单渲染。

合计本范围 **5 个可见组件**（另 3 组菜单条目共用 MenuView 渲染）。

**容易被遗漏的 UI**
1. **`/` 触发预览弹层**（MenuView）：它不是独立的命令弹框，而是从 `conversation.input.overlay` 锚点浮起的组合菜单（命令+技能+子代理分组同屏、mousedown 选行、`aria-activedescendant`、点击 composer 卡片不关闭）。重建 demo 时很容易只做出某一种 source 而漏掉"多分组共用一个 listbox + 分组标题 + loading 行"。
2. **命令执行行卡片**：裸执行/popupSelect 的 onSelect 提交后，结果**不会**在本包渲染，而是 ui-conversation 的 `conversation.chat.commandview` keyed slot 里的 flow 节点（GenericCommandCard/CompactionCommandCard）。漏掉它会导致"命令执行了但没有可见结果行"。
3. **popupSelect 外壳与 slash 菜单是同一个 overlay slot 的两种"卡片模式"**：slash 菜单是 combobox（textarea 持焦），popupSelect 是焦点持有 + 内置搜索 + 风险确认——两套交互模式嵌套在同一锚点，容易只还原一个。
4. **子代理目录面板**：多级懒加载树 + 触发按钮的活动点/计数、每行 mode/activity/token/时长 metrics、loading 占位行、error/diagnostic 行、`openChild` 打开二级会话——比单纯"@ 提及菜单"复杂得多，且与 `@` source 是独立两套 UI。
5. **只读 composer 接管**：一次性子代理 / 父离线可继续子代理的会话下方出现只读提示条（`role=status`），是 composer 链的替换（priority -10），不是普通禁用。
6. **技能工具行**（SkillRow）：`tool.call.toolview` keyed，折叠 → `Instructions` disclosure → `Inspect`，生命周期着色（running/error/stopped），可能被当成普通工具行而遗漏其专属卡片。
7. **程序化命令启动器**（`toggleSource` / launcher store）：ui-input-trigger 支持从一个按钮打开唯一 source 的菜单（合成 selection span）——一个"命令面板按钮"入口，容易被当作只由键入触发。
