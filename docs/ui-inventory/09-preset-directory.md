# UI 组件完整盘点 · 09 · Agent 预设 与 目录选择

> 目标：为"重建 UI demo"提供不遗漏任何可见组件的精确清单。
> 范围：三个 client 包 —— `ui-agent-preset`（Agent 预设四层表面）、`ui-directory-picker-browse`（应用内浏览器目录选择）、`ui-directory-picker-native`（原生目录选择，无可见组件）。
> 仓库：`D:\github-Clone\deepseek-harness`，源码目录均为 `<包>\src\client\`。

---

## 一、ui-agent-preset — Agent 预设

**一句话**：一个 roster（预设清单）驱动四个表面 —— 新建会话 hero 上的 chip（staged 选择）、会话头只读 label、设置 General 页的默认预设行、设置里的 Agent presets 管理页（复制/删除/查看/设为默认）。Node 半是空 apply，浏览器半通过 `dsh.client` manifest 发现。

**数据源（wire 调用，`ctx.get('connection').api`）**：
- `agentPresets.list` —— roster（含 trust、isDefault、broken、name、description、authorable、hasDocument）
- `agentPresets.select / read / copy / openDocument / remove`
- `settings.describe`（判定 writable）、`settings.update`（写 `agent-presets` namespace 的 `default` 字段）
- 事件：`settings/document-updated`、`agent-preset/selected`、`connection/reset`

### 可见组件

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| **AgentPresetSeat.tsx**（新建会话 hero chip） | 一个按钮：预设 icon + 当前预设名 + 下箭头 chevron；点击弹出 Menu，每项含名称 + 描述（无描述显示"无描述"）。含"introduce"开场动画（icon 渐入 + 名称逐字符淡入淡出，尊重 prefers-reduced-motion）。空 roster 或加载中返回 null 不渲染 | `agentPresets.list` → seat-store 的 `AgentPresetSeatState`（options/current/staged/introduce） | `conversation.hero.agentPreset` | 选择是 **staged**：应用到下一个成为 current 且 blank 的会话，用后即弃，下一个新会话回到 deployment default。与旁边 workspace picker 并列。busy 时禁用 |
| **AgentPresetLabel.tsx**（会话头只读 label） | `<span>`：预设 outline icon(14) + 预设显示名；title 提示为描述或 `headerHint`。会话无预设则返回 null | 会话 summary 的 `agentPreset` 字段 + roster（解析显示名） | `conversation.session.header.actions`，id `agent-preset`，order -10 | 只读静态 chrome，紧邻会话标题。只读原因是会话一旦开始拒绝换预设 |
| **AgentPresetRow.tsx**（设置 General 页默认预设行） | 行：标题 + 描述（error 时 role=alert）；右侧 PresetMenu 选择器（按钮 + chevron）。无预设（unavailable）返回 null；不可写/加载/保存中禁用 | `agentPreset.list` + `settings.describe`（writable）→ settings-store `AgentPresetSettingsState` | `settings.general.item`，id `agent-preset`，order -25 | 写的是"新会话默认"设置字段，不打扰运行中会话。error 状态下描述区 role=alert。空选项则禁用 |
| **AgentPresetSection.tsx**（设置 → Agent presets 管理页，含 3 个子 Modal + 卡片网格，见下） | 整页内容（见子组件行） | `agentPreset.list` → section-store `AgentPresetSectionState` | `settings.section`，id `agent-presets`，order 20（在 Models 之后） | 浏览器**不编辑**任何组合文本；预设=文件 |
| **├ 卡片网格行（卡片本体）** | 每张卡：头部（名称 + **broken 徽标**红边 + 内置/自定义 badge + **In Use 徽标**当为默认）、描述（CSS 4 行截断 + hover tooltip，仅溢出时挂载 Tooltip）、可选 broken 原因(role=alert)、`<code>` id。卡片本身是按钮（设为默认，disabled 若已是默认或 broken）；broken 卡红色边框 + body 禁用 | roster rows | （属上 section） | 类型分为内置组 / 自定义组两个 heading 分组；自定义组即使为空仍显示（含 + 作者按钮） |
| **├ 卡片脚部操作按钮** | 内置行：**查看(view)**（IconBrowse，打开只读 viewer）、**复制**（IconCopy）;自定义行：**打开位置/location**（IconFolderOpen，hasDocument 时打开目录否则揭示路径文本）、复制、**删除**（IconTrash，仅自定义）。图标按钮均带 tooltip + aria-label | — | （属上 section） | broken 自定义行保留 location + delete；broken 内置行连 viewer 也隐藏。不可 authorable 时复制禁用并 tooltip 说明 |
| **├ 揭示路径文本** | `<p>`："Location"+ `<code>` 路径 —— hasDocument=false 时展示目录文本供手工复制 | `openDocument` 返回的 value.path（opened=false 时） | （属上 section） | 非链接，纯显示文本 |
| **├ CopyDialog（复制 Modal）** | Modal：标题含"复制自 <来源名>"；两个输入（preset id 必填 / display name 可选）+ 错误提示(role=alert)；底部 取消 / 创建(创建中变"Creating") 按钮。创建（Create）按钮在 id 为空/非法/重名（`draftBlocker`）时禁用 | `agentPreset.copy({from,id,name?})`；客户端校验 `^[a-z0-9][a-z0-9-]*$` | （属上 section） | 复制完成后自动 openLocation（打开新目录）。错误显示在对话框内，不外溢 |
| **├ 只读 viewer Modal** | Modal：标题"查看 · <名>"，`<pre>` 展示组合原文（content），底部 Close 按钮 | `agentPreset.read` → PresetView.content | （属上 section） | 仅内置 preset 可打开；作者入口（Creator）在自定义组尾部 |
| **├ 删除确认 Modal** | Modal：删除标题/描述；Cancel + 删除确认按钮（删除中变"Deleting"） | `agentPreset.remove` | （属上 section） | 仅自定义行。删除后重读 roster；运行中会话不受影响 |
| **├ 作者入口按钮（Creator）** | 虚线按钮：Icon+ 加号 + "Let the agent draft one"（自定义组尾部；roster 含 `cordis` 预设且存在 creatorDraft 时显示），不可 authorable 时禁用 + tooltip | startCreatorDraft（stage cordis + startSession） | （属上 section） | 点击后关闭设置面板并启动新会话 |
| **PresetMenu.tsx**（共享选择菜单） | 按钮（label + IconChevronDown14）+ Menu，每项显示名称，`trust==='user'` 时追加"· Custom"标记 | props（两个调用者各自传 options/selectedId/label） | 无独立 slot（内部组件，供 Row 与 Seat 复用） | 不要把 user 预设伪装成 shipped。align end，portal |
| （错误态）Section error | 页面级错误：`error + <msg>`(role=alert) + 重试按钮 | 加载失败 | （属上 section） | status=error 时整页替换 |

**容易被遗漏**：
- **introduce 开场动画**（Seat 的逐字符淡入、prefers-reduced-motion 分支）。
- **卡片 CSS 截断 + 条件 Tooltip**（描述截断才挂 Tooltip，空 title 防双 tooltip）。
- **broken 变异卡**（红边 + "Failed to load" 徽标 + 原因文字 + disabled body + 内外置动作差异）。
- **user 信任标记"· Custom"**（两处：PresetMenu 行项、卡片 badge）。
- **dashed 作者入口按钮**（多数盘点会漏掉这个非主流程控件）。
- **四个表面各自的"空 roster 即不渲染"**（unavailable 分支，Seat/Row/Label/Section 都有）。
- **头部 label 是纯静态 chrome，不是选择器**（重建时别做成可交互）。

---

## 二、ui-directory-picker-browse — 应用内(浏览器)目录选择

**一句话**：填充 ui-workspace 的两个 directory-flow 槽位，用 680×500 的 Miller 列视图对话框驱动 host 的 `listDirectory`/`createDirectory`。不依赖本地 OS 选择器，适用于进程内与远程浏览器部署。Node 半空 apply。

**数据源**：`ctx.workspaces.listDirectory(path?, signal)`、`ctx.workspaces.createDirectory(path, name)`；输入为 `DirectoryListing`（含 crumbs、home、path、entries[DirectoryEntry: name/path/hidden]、truncated）。注册走嵌套 `slots.inject()`。

### 可见组件

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| **BrowserDirectoryFlow → DirectoryBrowser.tsx**（主对话框，headless Modal） | 680×500 对话框；header（标题 + 面包屑 + 路径编辑区）、内容（Miller 列）、footer（按钮栏） | `listDirectory`/`createDirectory`（经 flow.ts 注入） | `conversation.hero.workspace.directoryFlow` **和** `sidebar.workspaces.directoryFlow`（同实例注册两处） | `onPicked`=确认目录，`onClose`=取消；浏览失败留在对话框内 alert，不驱动 owner onError |
| **├ 面包屑（crumb bar）** | 选择路径的可点击面包屑链（`nav` 语义每一 crumb 按钮，crumb 间 chevron 分隔；home 子树内首项用本地化"主目录"，外置则全祖先、根以其路径为名）。host 路径因 home 反斜杠推断 `\`/`/` 分隔符 | listing.crumbs + home | （属对话框） | tail 自动 scrollLeft 保持可见 |
| **├ 路径编辑区（edit zone ↔ input）** | 面包屑右侧铅笔按钮（IconEdit + title "编辑路径"）点击进入 `input` 编辑模式；input 以尾随分隔符预填；Enter 提交（跳过 IME composition）、Escape/点击离开取消；输入时对最后 pane 做前缀过滤（dot 前缀还揭示隐藏项） | 编辑触发 draft-following scan（debounce 250ms） | （属对话框） | 编辑区覆盖剩余宽度，whole-bar hover 高亮；提交后仍保 breadcrumb 落点 |
| **├ Miller 列视图（LevelColumn）** | 无选中时一整列；选中行后均分为两列（左侧父级、右侧子级 children），hairline divider；每列 `role=list`，行是**原生 button**（IconFolderClose/Open + 名称 + 右 chevron），选中行 aria-current + 高亮。右列点选推进一层 | parent/child 两个 listing | （属对话框） | 导航 quiet + selection-anchored（双列同帧落地，父腿 200ms 超时降级单列）；窄视口横向滚动 |
| **├ 加载指示** | 浮动"Loading…"状态带（role=status）—— 仅当扫描超过 300ms 才显示（fast 列表不闪现） | slowScan state | （属对话框） | 易漏：不是常驻 loading，是延迟浮现 |
| **├ 截断提示** | "Too many folders…" 状态文字（role=status）当 parent/child truncated | listing.truncated 标志 | （属对话框） | |
| **├ 错误 alert** | `role=alert` 错误文字（列表失败/创建失败展示在对话框内） | DirectoryBrowseError/Error | （属对话框） | |
| **├ footer 操作栏** | 左：**新建文件夹**（IconPlus，outline button）；**显示隐藏文件** 切换按钮（aria-pressed + 选中时尾随 IconCheck，纯客户端过滤）；spacer；右：**取消** + **打开**（primary，disabled 无 target/加载/编辑中）。Open 采用选中文件夹，否则回退到当前层级 | — | （属对话框） | 隐藏项始终由 host 返回并标记，toggle 只是客户端显示过滤 |
| **├ 嵌套新建文件夹 Modal** | 二级 headless Modal（813:23278）：标题 + "在 <target> 中新建文件夹" + 文件夹名 input（placeholder 未命名文件夹）+ 创建错误 + 取消/创建按钮；Enter 提交含 IME guard；Escape 取消 | `createDirectory(targetPath, name)`，成功后重新 list 并选中新夹 | （属对话框） | 二级 Modal 弹出时父对话框控件致 inert（Modal 无焦点陷阱）；创建中禁用取消 |
| **（flow.ts BrowseDirectoryFlow）** — 无自身 UI，仅把 owner 会话适配到对话框 | 返回 `<DirectoryBrowser open busy onOpen=onPicked onClose=onCancel …>` | 见上 | 上两槽 | 纯适配层，非可见组件 |

**容易被遗漏**：
- **延迟浮现的 Loading pill**（300ms 门槛），不是立即显示。
- **截断提示**与 **role=alert 错误条**（三个 status/error 层）。
- **路径编辑的 dot-前缀揭示隐藏项** 与 **IME guard**（composition 不提交）。
- **"显示隐藏文件"切换的 aria-pressed + 尾随 check 图标**（Menu 选中词汇，label 不位移）。
- **选中行豁免一切过滤**（hidden/prefix 都不孤儿化选中行）。
- **Miller 一/两列切换与 hairline divider**、**窄视口横向滚动 + 自动 pin 到子列**。
- 面包屑在 home 子树内以"主目录"本地化文本为首项，外部则全祖先。

---

## 三、ui-directory-picker-native — 原生目录选择

**一句话**：无可见 UI。渲染空（renderless）occupant，每次 `open` 上升沿调用一次 host OS 选择器（`ctx.workspaces.pickDirectory()`），把一个结果（选中路径 / 取消 / 失败）报回 owner。仅适用于本地 Host 载体（OS 对话框开在 Host 所在机器上）。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| **NativeDirectoryFlow.tsx**（flow.ts） | 返回 `null`，**无任何 DOM** —— 对话框渲染在宿主 OS 上，不在浏览器 | `ctx.workspaces.pickDirectory()` → `string \| null` | `conversation.hero.workspace.directoryFlow` **和** `sidebar.workspaces.directoryFlow`（同实例两处） | `armed` ref 保证每次 open 只跑一次选择器（adoption 保持 open 不变时不重开）；outcome 走 ref 触达 owner 最新 handlers；onError 用 owner 错误面 |
| （index.ts apply） | 无 | 仅注入 `pick` | 上两槽，嵌套 slots.inject() 事务化 | 纯注册逻辑，非可见组件 |

**容易被遗漏**：
- **这个包没有任何浏览器可见元素** —— 盘点时不应误以为有目录选择弹窗。
- 但要补全重建清单，需模拟"OS 对话框出现"这一外部动作及其 **三种结果回流**（picked path / cancel / failure —— 分别映射 owner 的 onPicked / onCancel / onError）。
- in-process 与 remote-browser 部署需要改用 `-browse` 组合（此包只对本地 Host 有效）。

---

## 汇总（重建 demo 的最小可见面）

- **ui-agent-preset**：4 个注册表面 + 1 个复用菜单 = **5 个可见组件**（Seat chip / 头 label / General 行 / 管理页[卡片网格+3 个 Modal+作者按钮] / PresetMenu），外加状态变化（broken 卡、introduce 动画、CSS 截断 tooltip）。
- **ui-directory-picker-browse**：**1 个主对话框**（DirectoryBrowser），包含面包屑、路径编辑、Miller 列、加载/截断/错误状态、footer 栏、嵌套新建 Modal 等多子件。
- **ui-directory-picker-native**：**0 个可见组件**（renderless，仅在宿主 OS 渲染对话框）。

**最易遗漏**：预设的 introduce 动画与 broken 变异卡、browse 的延迟 Loading pill + 隐藏文件 toggle、native 包的无 UI 特性（需用外部 OS 对话框带三种结果回流来补全 demo）。
