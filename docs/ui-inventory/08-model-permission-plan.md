# Web GUI UI 组件完整盘点：模型选择 / 权限预设 / 计划模式

> 目的：为另一 AI 重建 UI demo 提供精确、不遗漏任何可见组件的清单。
>
> 覆盖三个包（均为浏览器 Client 半部）：
> - `@deepseek-ai/dsh-client-ui-model-selection`（模型选择）
> - `@deepseek-ai/dsh-client-ui-permission-presets`（权限预设）
> - `@deepseek-ai/dsh-client-ui-plan`（计划模式）
>
> 仓库根：`D:\github-Clone\deepseek-harness`
> 说明：三个包都通过「Slots 注册」与「CommandUi / Command 装饰」挂载，不直接渲染到独立页面。下表记录每个可见组件的渲染内容、数据源与注册位置。

---

## 一、ui-model-selection（模型选择）

**架构**：两个入口共享「每个会话一个」的 `ModelDirectory` 实例（`ctx.modelDirectories` 服务）：
1. `/model` 命令的 popupSelect 弹窗（通过 `ctx.commandUi.register`，`kind: 'popupSelect'`）
2. composer 的具名席位 `conversation.input.model`（通过 `ctx.slots.register`）

两者数据源相同（`session.models` RPC → `SessionModels` 目录），提交相同（`session.selectModel` RPC → `ModelSelection`）。Host 上报的 `ModelSelection` 是唯一选择事实，两个入口互为回显。被寻址的 subagent 会话两个入口都不渲染（`available` 为 false）。

**Key 数据形态**（`ModelDirectoryState`，两入口渲染来源）：
- `current: ModelSelection | null`（当前选择：provider/model/reasoningEffort）
- `routable: boolean | null`（Host 是否适配当前路由；`false` 时 composer 被 block 并惰性化输入）
- `groups: ModelProviderGroup[]`（provider 分组 → 每组 models[]）
- `failures: ModelCatalogFailure[]`（provider 局部加载失败，只展示不可选）
- `status: 'idle'|'loading'|'ready'|'selecting'|'error'`

### 可见组件表

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `/model` popupSelect（`src/client/index.ts` Entry 1） | 弹窗内一列选项：每个模型一行（label=模型名，detail=`Provider名 · 模型描述`），当前选中项标 `active`；加载失败的 provider 也列出一行但不可选（label=失败名，detail="目录加载失败：msg"）。选中后提交 `ModelDirectory.select` | `session.models`（经 `ModelDirectory.load()` 目录）；**无 `<select>`、无原生分页** | CommandUi `commandUi.register` 命令 `model`（弹窗 shell 由 ui-commands 提供） | 命令描述来自 `model` locale `command.description`；`available`=非 subagent；失败行 never selectable；kebab → 无标题转换（模型列表直接用 Host 名称） |
| **模型弹窗选项构建 `optionsOf`**（index.ts） | 把目录拍平成 `SelectOption[]`：`id=providerId/modelId`、`label=model.name`、`detail`、`active`；追加 failure 行 `id=failure/<id>` | `ModelDirectoryState.groups/.failures/.current` | （不单独注册；是 /model 弹窗的渲染数据） | 非可见组件，但决定弹窗行为 |
| **触发对象定位 `selectionOf`**（index.ts） | 由选中行 id 还原完整 `ModelSelection`；同路由保留当前 `reasoningEffort`，否则用模型 adapter 的 `reasoning.defaultEffort` | `ModelDirectoryState` | （非可见；/model 的 onSelect 处理） | — |
| **composer 模型席 ToggleButton 触发器**（`ModelSelect.tsx`） | 按钮显示：模型名（caption 色调）+ 可选 effort 标签（`模型名 · effort名`）；无 effort 时只有模型名；未选择时显示 fallback「Select model」。带 chevron-down、aria-haspopup、`disabled={locked}` | `state.current` + groups 匹配（选中的 model）+ `model.reasoning`（effort） | `conversation.input.model` 席位（composer 尾行，斑马在 ContextMeter 之前，`modelSeatLocked` 传 `locked`） | 图 313:14108 ToggleButton；`title=triggerLabel`；悬停提示 |
| **模型/Effort 两级菜单（root pane）**（ModelSelect.tsx） | 两行菜单项：`模型`（值=当前模型名 + 右 chevron）与 `推理等级`（值=当前 effort 名 + 右 chevron；仅在 `reasoning !== undefined` 时渲染） | `state.*` | 同上（菜单附着于 seat） | 图 496:26454 MenuDropdown；root 是菜单首层 |
| **模型列表子面板（model pane）** | 按 provider 分组的模型列表：loading 时为「正在刷新模型列表…」状态条；provider 失败显示 `warning.groupLoad` 行 + Retry；有 in-menu error 条 + Retry（仅当最近失败动作是 load）；每个分组有 group 标题，每行 = 模型名 + 描述 + 选中勾选 IconCheck | `state.groups`（按 provider 分组）、`state.status`、`state.error`、`state.failures` | 同上（菜单 model 子面板） | 空态：`empty.models`「没有可用的模型。」；菜单 `aria-busy` |
| **推理等级子面板（effort pane）** | 当前模型的 effort 等级列表：每个等级行 = 名称 + 描述 + 选中勾选；还能选择「Default」（`effort.providerDefault`，仅当模型有 default 时作为首项）；空态 `empty.efforts` | `model.reasoning.efforts` + `reasoning.defaultEffort` + `state.current.reasoningEffort` | 同上（菜单 effort 子面板） | 无 effort 元数据的模型无 effort 行；`chooseEffort` 同样走 select |
| **选择被拒 Toast**（ModelSelect.tsx） | 拒绝选择时锚定 composer card（`[data-composer-card]`）滑出的 transient Toast：警告图标 + `error.action` 文案，自动消失 | `directory.getSnapshot().error`（select 失败） | 附着于 seat 根节点 | 与 in-menu 错误条分工：load 失败→内联条；select 失败→Toast |
| **composer 拦截 block / 输入惰性**（`service.ts` directoryFor） | 不在本包渲染：当 `routable === false`（非 null）时设 `conversation.blocks[<sessionId>]` = `blocked.composer`「当前模型不可用，请先选择模型」，输入区整体惰性化（无渲染组件，是状态效果） | `state.routable === false` | `conversation.blocks`（ui-conversation 提供） | 触发菜单的 fallback「Select model」仍是显示层兜底，不 gate |

**容易被遗漏**：
- `/model` 弹窗与 composer 席**共享同一目录状态**——在任一入口切换，另一入口下一帧即回显（重建 demo 时须让两者读同一 store，切换相互可见）。
- 触发器按钮的 `title`/`aria` 文案随 effort 存在与否变化（`trigger.aria` vs `trigger.ariaEffort`）。
- `Menu` 的打开逻辑：每次 open 都触发 `reload()`（重新拉取目录）。
- Esc 先退回根 pane 再关闭；ArrowUp/Down 在菜单项间循环聚焦（可访问性细节）。
- provider 失败行与普通模型行**视觉可区分**（警告样式+Retry），但不可选。
- `routable=false` 的 block 文案是本包自持副本（非 composer 提供）。
- 连接重置（`connection/reset`）会清空并重拉所有 resident 目录。

---

## 二、ui-permission-presets（权限预设）

**架构**：两个不同生命周期的浏览器表面：
1. **General 设置行**（`settings.general.item` slot）——写入「之后创建会话」的默认权限预设，值只对后续会话生效，不切换当前会话。
2. **`/permission` popupSelect 装饰**（`ctx.commandUi.decorate`）——当前会话的权限选择器，选中后提交命令行为 `/permission <preset>`。

两者读取同一 Host 计算投影 `permissions`（composer 的权限 chip 也读它），写路径同为 `/permission` 命令。权限能力缺失时两者都不渲染。

**Key 数据形态**：
- 弹出装饰读：`session.projections.faceOf('permissions')` → `PermissionSelect`（`options`、`currentValue`）
- 设置行读：Host Settings 描述符 `permission` 命名空间（`defaultPreset` 值 + schema `const` 枚举），经 `PermissionPresetSettingsController`
- 预设 `danger-full-access` = `FULL_ACCESS_PRESET`：两个表面都要求明确风险确认才写入

### 可见组件表

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| **General 设置行（PermissionRow）**（`PermissionRow.tsx`） | 设置页一行：标题「权限」+ 描述「选择新会话的默认权限模式」+ 右侧下拉选择器按钮（显示当前预设标签 + chevron-down）。点开是菜单列表（各预设标签，当前项高亮）。不可写/无选项时按钮 disabled；状态 error 显示在 desc（`role=alert`） | Host Settings `permission` 命名空间（`defaultPreset` + schema const 枚举）经 `controller.store` | `settings.general.item`（id=`permission`，order=-20，locale=`settings.permission`） | 只对「之后创建的会话」生效；状态 `unavailable`（host 无该设置）返回 null 不渲染；Web-only surface |
| **Full access 风险确认（RiskConfirmation）**（PermissionRow.tsx） | 选中 `danger-full-access` 时弹出确认对话框：标题/描述/「我已了解风险，并愿意继续」勾选/取消/「启用 Full access」；未勾选 acknowledge 时确认按钮禁用 | 静态 locale（`confirm.*` keys） | 附着于设置行 | 与 composer 权限 chip 的确认文案是各自持有的重复副本（access 命名空间） |
| **`/permission` popupSelect 装饰**（`src/client/index.ts`） | 弹窗：一列预设（标题大小写标签，如 `workspace-write`→「Workspace Write」），当前值标 active，`custom` 值被过滤；`danger-full-access` 行带 `confirmation`（选中后先弹风险确认再提交）。选择后执行 `/permission <preset>` 命令 | 当前会话 `permissions` 投影（`session.projections.faceOf('permissions')`） | CommandUi `commandUi.decorate` 命令 `permission`（弹窗 shell 由 ui-commands 提供） | 装饰只替换「裸调用」；`available`=投影存在时；Full access 行共享与 composer 相同的风险门 |
| **选项处理 `optionsOf`**（index.ts） | 拍平投影 select → `SelectOption[]`：`id=value`、`label=displayPermissionPreset(...)`、`detail=description`、`active`；给 Full access 附加 `confirmation` 元数据 | `PermissionSelect.options/.currentValue` | （非可见；/permission 装饰的渲染数据） | — |
| **`/permission` 装饰 onSelect**（index.ts） | 提交 `/permission <optionId>` 命令，command failed 显示错误；`matched:false` 报「host 无 /permission 命令」 | `session.command(...)` | （非可见） | 命令路径兼顾斜杠菜单行与参数直连 |

**容易被遗漏**：
- **两个 surface 读同一 `permissions` 投影但写同一命令路径**——composer 权限 chip（属 ui-conversation 而非本包）与 `/permission` 选择器渲染**相同的列表与 active 标记**，重建时须让它们共享一个数据源才一致。
- `danger-full-access` 在两个表面都有**风险确认门**（设置行 = 行内 RiskConfirmation；弹出装饰 = 弹窗 confirmation），文案重复但分别持有。
- 设置行 `order=-20` 决定其在 General 设置页中的位置。
- `custom` 值被过滤、永不显示为可选行。
- 弹出装饰仅在投影 key 存在时可用（`available` 守卫）——无权限的 composition 两者都不出现。
- 设置行不是 `<select>`，是 **Menu + 触发器按钮**组合；当前状态 busy/不可写时按钮禁用。
- 设置行只在 Web 端存在（README 明确「Web-only」）。

---

## 三、ui-plan（计划模式）

**架构**：纯浏览器 surface。占 composer 的具名席位 `conversation.input.plan`（在 access 模式控件右侧）；只有「计划模式生效」时渲染一个状态 chip，点击执行 `/plan off`；否则席位为空。节点半部为空的 apply（仅 roster 行）。

计划行为本身（`/plan` 命令、`plan/mode` 状态、`plan` 投影单元）由 `@deepseek-ai/dsh-plan-mode` 拥有，本包只渲染投影并发命令。**无非活动态计划控件**——进入只能通过 `+` 命令菜单选 Plan 或输入 `/plan`。

**Key 数据形态**：`useProjection('plan')` → `{ active, pending }`；有效目标 `target = pending ? !active : active`（folded host 值，非客户端乐观）。

### 可见组件表

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| **Plan 状态 chip（PlanChip）**（`PlanModeControl.tsx`） | warn 色「Plan」状态按钮 + 关闭图标（IconCloseFill）；`aria-label`/`title` 用 `chip.on.*`（「Plan mode on, press to turn off」）；点击执行 `/plan off`。`disabled={locked \|\| leaving}`（leaving 反馈禁用） | `useProjection('plan')` → 有效目标为 plan mode 时渲染 | `conversation.input.plan` 席位（composer 工具栏 `modes` 行，紧邻 access 选择器右侧） | 仅 active/pending 为真时渲染；`plan === undefined`（无 plan-mode host 或无 session 的 Draft）返回 null，「Plan」是设计字面量，所有 locale 都写「Plan」 |
| **退出失败内联行**（PlanModeControl.tsx） | chip 右侧 `role=status` 的英文错误 `failed to exit plan mode`（错误面策略不本地化），title=完整错误 | `exitPlanMode()`（`ctx.remote.commands.execute(sid,'/plan off')`）失败返回字符串 | 附着于 seat | chip 保持直到投影确认退出 |
| **composer 占位符切换（占位符非本包渲染）** | 计划模式上时，composer textarea 占位符切换为 `placeholder.plan`/`hint.plan`（默认 "describe your task to generate plan"），由 ui-conversation 渲染，与本包共享 `conversation` 命名空间副本 | 同 `plan` 投影的 active 判定 + ui-conversation locale | 由 ui-conversation `InputBar` 渲染（非本包 slot） | 属 ui-conversation 包，但计划模式的重建 demo 常漏掉占位符变化；steer-queue 等更高优先级占位符会覆盖它 |
| **composer + 命令菜单入口（非本包）** | `/plan` 进入入口由 `+` 命令菜单（ui-commands）与 `@dsh-plan-mode` 提供；本包**不渲染非活动计划控件** | — | 命令菜单（ui-commands） | 重建 demo 时勿在本包加「进入计划」控件；入口属于命令面板 |

**容易被遗漏**：
- chip 的 `target` 是 `pending ? !active : active` 折叠值，**不是**简单 `active`——过渡态 pending 也要渲染。
- 渲染条件用 `plan === undefined` 判空返 null（无 plan-mode 的 host、无会话 Draft 都不显示）。
- chip 的 an/A 属性 `chip.on.*`，而 locale 里还有未启用的 `chip.off.*`（对象里定义了 off 键但组件只渲染 on 态——off 态由 `/plan` 命令 menu 表达）。
- 错误文案固定英文（错误面不本地化）。
- 占位符/入口属于其他包（ui-conversation / ui-commands / dsh-plan-mode），非本包可见组件但影响完整重建。

---

## 附：composer 席位位置（重建 demo 用）

来自 `packages/client/ui-conversation/src/client/skeleton/InputBar.tsx`：
- **`conversation.input.plan`**：渲染于工具栏 `tools` 行的 `modes` 容器内，紧跟 access 模式选择器（`{accessSelect}{renderSlot('conversation.input.plan')}`）。
- **`conversation.input.model`**：渲染于 `trailing` 行，`ContextMeter` 之前（`renderSlot('conversation.input.model', { locked: modelSeatLocked })`）。

两者 slot 声明：`{ kind: 'single', scope: 'session' }`，owner 共享 `InputControlOwnerProps`（含 `locked`）。
