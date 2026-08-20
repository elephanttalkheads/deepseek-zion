# DSH Web GUI 设置体系 UI 组件完整盘点

> 目的：给另一个 AI 重建 DSH Web GUI **设置体系（Settings）** demo 用的精确清单，不遗漏任何可见 UI 组件。
>
> 盘点范围（5 个 client 包，`src/client` 下，跳过 `*.module.css` / `*.d.ts` / tests）：
> - `ui-settings` —— 设置领域基础层（无自身 UI，提供 `ctx.settingsScope` 与 slot 类型契约）
> - `ui-settings-general` —— 设置外壳（`sidebar.settings` 占用者：导航 + 模态面板 + on-boarding 舞台 + 通用设置页）
> - `ui-settings-models` —— 模型设置页（provider 行 + 编辑器卡片 + 首次运行 onboarding 弹窗）★核心
> - `ui-settings-plugin-inventory` —— 已安装插件清单（只读）
> - `ui-settings-plugins` —— Plugins 设置节 + 可配置插件卡片

## 0. 设置面板整体拓扑（便于重建）

Settings 是一个**模态对话框**，由 `ui-settings-general` 的 `SettingsRoot` 渲染，占用 `sidebar.settings` slot。结构：

```
[sidebar 底部「设置」触发按钮]  ← SettingsRoot 内 trigger button
  └─ 点击打开模态面板 SettingsPanel
       ├─ 左侧导航栏 nav：每个设置页是一个 settings.section 注册项（order 排序），带图标+label
       │    导航项由 ui-settings 声明 / ui-settings-general 渲染：
       │    - General（通用设置，order 0，settings.general.item 行）
       │    - Models（模型，order 10，来自 ui-settings-models）
       │    - Plugins（插件，order 15，来自 ui-settings-plugins）
       │    （图标：data/models=图标DataOutline，agent-presets=AgentPreset，plugins=Personalization，其余=齿轮）
       ├─ 内容列 header：settings.action（如「打开配置文件」）+ 关闭按钮（settings.close 隐藏文本）
       └─ 内容列 options：当前 section 的内容（renderSlot 只渲染 active 项）
```

- **slot 注册机制**：每个设置页 / 行 / 操作通过 `ctx.slots.register()` 注册成根级 list slot 条目。
  - `settings.section`：一页一个（nav 行 + 页面内容）
  - `settings.general.item`：通用设置页内的一行偏好（Language、Appearance、Composer Enter 等由各自 feature 插件注册）
  - `settings.plugins.tab`：Plugins 节内的页面（标签页：Plugin configuration / Plugin list）
  - `settings.plugin.item`：插件配置卡片（按 settings 命名空间 key）
  - `settings.action`：内容列 header 操作
  - `settings.onboarding`：首次运行步骤（一次挂载一个）
  - `settings.trigger` / `settings.header` / `settings.close`：触发/标题/关闭文案
- **数据源**：`ctx.settingsScope`（Host settings 传输，读 `settings.describe`、写 `settings.mutate`，revision-fenced）、`ctx.remote.*`、各 store。

---

## 1. `ui-settings` —— 设置领域基础层（无可见 UI）

本包**没有任何可见组件**，是注册机制与传输层。重建 UI 时不需要画任何东西，但需理解：
- 提供 `ctx.settingsScope.bind(spec)` 服务，供所有偏好行绑定其持久化命名空间 section。
- 声明全部 settings slot 类型契约（无样式、无渲染）。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/index.ts` | （无 UI）apply 里 `new SettingsScopeBinder(ctx)`，提供 `ctx.settingsScope` 服务 | 无 | 无 | 无 inject，等待什么都不需要；绑定按调用方 ctx 解析 |
| `src/client/settings-scope.ts` | （无 UI）`SettingsScopeBinder`/`SettingsScopeController<T>` 类：守护 snapshot store、revision-fenced 读写、`settings/document-updated` 事件刷新 | `settings.describe` / `settings.mutate`（通过 connection.api） | 无 | remote 浏览器仅 loopback 持久；`decode` 缺省时校验 schema |
| `src/client/contract/slots.ts` | （无 UI）定义全部 settings slot 类型：`settings.trigger`/`settings.header`/`settings.action`/`settings.close`/`settings.section`/`settings.plugins.tab`/`settings.onboarding`/`settings.general.item` | — | 类型仅 | owner props：`SettingsTriggerOwnerProps.wide`、`SettingsSectionOwnerProps.close`、`SettingsOnboardingOwnerProps{stepId,complete,openSection}`；general.item 与 plugins.tab owner 空 |

> 重建提示：无需重建此包，但 slot 类型决定了外壳与各页如何拼装。

---

## 2. `ui-settings-general` —— 设置外壳 + 通用设置（可见组件 4 + 状态逻辑）

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/SettingsRoot.tsx` | **设置外壳根 + 模态面板**：侧栏底部 trigger 按钮（窄栏只有图标，宽栏图标+“设置”）；打开后全屏遮罩+居中面板（约 1080×700），左侧导航列（每 section 一个 navCell：图标+label，active 高亮 aria-current），右侧内容列（header 内 `settings.action` + 关闭按钮；options 渲染 active section）。Escape/遮罩点击/关闭按钮关闭，进入聚焦关闭按钮 | `useSections`（settings.section ledger 投影成 nav 行）、`useOnboardingSteps`（settings.onboarding ledger）、`useSessions`（判断 empty-Hero 以激活 onboarding） | `sidebar.settings`（注入） | 纯组合面：**所有文案都来自 registrants**（trigger/header/close/section）。`openSection(id)` 可由 onboarding 步骤调用。图标按 section id 映射：models/data、agent-presets、plugins、其余齿轮 |
| `src/client/chrome.tsx` | 三个**纯文案/图标**小组件：`TriggerContent`（侧栏触发内容：图标+wide 时 label“设置”）、`HeaderContent`（面板标题“设置”）、`CloseLabel`（关闭按钮隐藏文本“关闭”） | 本地 locale 字典 | `settings.trigger`、`settings.header`、`settings.close` | 图标 IconSettingsOutline14/16 |
| `src/client/GeneralSection.tsx` | **通用设置页内容列**：一个 div 内 `renderSlot('settings.general.item')`，本身无内置行（行由各 feature 插件注册） | — | `settings.section (id=general, order 0)` 的渲染（声明 `settings.general.item` 子 slot） | 空列无默认文本 |
| `src/client/SettingsDocumentAction.tsx` | 内容列 header 的**“打开配置文件”操作按钮**（outline/sm），加载中隐藏；失败显示 `openDocument.error`（role=alert）。仅 loopback 且 Host `hasDocument` 为真时注册 | `SettingsDocumentStore`（`settings.describe`、`settings.openDocument`） | `settings.action (id=open-document, order 0)` | 本地文件操作：macOS `open -t`、Windows 桌面关联、WSL 转换 |
| `src/client/settings-document-store.ts` | （无 UI）`SettingsDocumentStore`：文档可用性 + 打开状态机（idle/loading/ready/unavailable + opening + error） | `settings.describe` / `settings.openDocument` | — | 无 |
| `src/client/shell-contract.ts` | （无 UI）类型：`SettingsSectionRow{id,order,label}`、`SettingsOnboardingStep{id,order}`、`SettingsRootInjected.hooks.{sections,onboardingSteps}` | — | 类型仅 | — |
| `src/client/locales.ts` / `index.ts` | 词典（trigger/title/close/openDocument/openDocument.error/general.nav）+ 注册；inject `['slots','locale','connection']` | — | 注册到 `sidebar.settings` 及 4 个内容 slot | — |

> 导航结构关键：**每个设置页 = 一个 `settings.section` 注册**。外壳把它们投影成左侧导航。General(order 0)、Models(order 10)、Plugins(order 15)。

---

## 3. `ui-settings-models` —— 模型设置页（★最复杂，provider 管理 + API key + onboarding）

**注册**：`settings.section (id=models, order 10)` 渲染 `ModelsSection`；`settings.onboarding` 注册 `welcome-notice`（order -100，`WelcomeNotice`）与 `deepseek-official`（order 0，`DeepSeekOnboardingDialog`）。
**数据源**：一个 `ModelsSettingsStore` 合并三个 wire 域 —— `llm.providers`（可配置 provider 目录 + 每 route 活跃/休眠态）、`settings.describe`（序列化 schema、分层红action值、secret slot）、`credentials.describe`（配置/来源/可写徽章）。inject `['slots','locale','connection','remote']`。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/ModelsSection.tsx` | **Models 页主体**：标题+介绍、只读提示、saved 状态条（role=status）；provider **行列表**（每行：显示名 + 可选“自定义”tag + API key 配置绿点/缺失红点 + 编辑/删除按钮）；行点击展开 `ProviderEditor`；下方**添加区**：Add provider（打开 dormant 目录下拉 + 编辑器）与 Add custom provider（打开 `CustomProviderCard`，仅当 pi-ai 命名空间 schema 有协议选择时启用）；删除确认 `Modal`（含删除 credential 说明） | `ModelsSettingsStore`（llm.providers + settings.describe + credentials.describe） | 渲染于 `settings.section(id=models)` | 一次只开一张编辑卡；first-run 未配置 key 的整节 provider 以 setup 卡形式显示而非行；删除先删凭证再删配置（幂等） |
| `src/client/store.ts` | （无 UI）`ModelsSettingsStore`：ProviderRow 连接（entry/configured/removable/apiKeyEnv/credential）、`deriveKeyRef`（`<ROUTE>_API_KEY`）、`protocolChoices`（从 schema 读 api 协议 union）、`providerUsable`、`onboardingReadiness` | llm/settings/credentials wire | — | 无 |
| `src/client/ProviderEditor.tsx` | **单个 provider 的编辑卡**（按适配器族手写布局）：顶部标题+route id；主字段 = **单个只读写 API key 密码输入**（`credentials.set` 写入 profile reference 下，从不出现在 settings.yaml）；“自定义设置”折叠 `<details>`：显示名(仅 declared pi-ai)、Base URL（deepseek 占位 `https://api.deepseek.com`）、API 协议下拉(仅 declared pi-ai)、模型目录；未知命名空间仅提示“其他字段在 settings.yaml”；底部 `EditorFooter`（取消/应用）| profile draft（user 层）、`credentials.describe/set`、`settings.mutate`（path ops + expectedRevision） | 由 ModelsSection/onboarding 内部渲染 | 布局按 ns：`llm-deepseek`=deepseek、`llm-pi-ai`=pi-ai、其余=unknown(仅提示)。`credentialOnly` 模式=诊断 onboard |
| `src/client/DeepSeekModelsEditor.tsx` | **DeepSeek 直连适配器的模型目录编辑器**：每行 id 输入 + 显示名输入 + 展开（chevron）+ 删除；展开显示 context window / max tokens（K/M 后缀文本，占位显示 adapter 默认）；菜单头部“模型目录”“使用适配器默认/已自定义”badge + “恢复默认”按钮；底部“添加模型” | `models` draft 数组、继承自 base/schema default | ProviderEditor 内部 | 校验：空 id/重复 id/空 name/非正容量；`parseCapacity` `256K`/`1M` |
| `src/client/ModelListEditor.tsx` | **pi-ai provider 的模型列表编辑器**：与 DeepSeek 同构的行（id/name/展开容量/删除 + 添加模型），额外 **“获取可用模型”** 按钮 → `llm.discoverModels` 询问当前表单端点 → 弹出**候选模型选择 Modal**（checkbox 列表 + 添加所选）；不可询问时提示 | `llm.discoverModels`、模型 draft | ProviderEditor / CustomProviderCard 内部 | 空列表=使用内置目录 |
| `src/client/CustomProviderCard.tsx` | **自定义 provider 创建卡**：Provider ID（小写字母开头，占位 acme-gateway，失败/已被占用提示）、显示名、Base URL、API 协议（下拉，从 schema 读）、API key（可留空=环境认证）、模型列表（复用 ModelListEditor 可询问）、底部创建/取消；`settings.mutate` 一次写整个 profile + `credentials.set` | `settings.mutate(ns=llm-pi-ai)`、`credentials.set`、`llm.discoverModels` | ModelsSection 内 | 写进 `llm-pi-ai.providers.<route>`；提交后 profile 已存在 |
| `src/client/DeepSeekOnboardingDialog.tsx` | **首次运行官方 DeepSeek 步骤**（switcher 门控：任何可用 provider → 不渲染）：`OnboardingModal` 内说明 + `ProviderEditor`（credentialOnly + credentialRequired + autoFocusCredential，“稍后配置 / 保存并继续”）| `onboardingReadiness`(共享 Models join) | 渲染于 `settings.onboarding(deepseek-official)` | 仅当用户还没有任何可用 provider 才提示 |
| `src/client/OnboardingModal.tsx` | **onboarding 共享模态外壳**：headless Modal + 设置 `#root.inert` + 标题（可选聚焦）| — | 内部包装 | 每个 step 拥有自己的 dialog chrome |
| `src/client/WelcomeNotice.tsx` | **内测声明 step**：`OnboardingModal` 内段落文本 + “继续”按钮；acknowledge 持久化到 `ui-onboarding.welcomeNoticeVersion` | `WelcomeNoticeStore`（settings.describe/mutate） | 渲染于 `settings.onboarding(welcome-notice)` | 版本 `2026-08-13.1`；remote 进程本地 |
| `src/client/welcome-store.ts` | （无 UI）`WelcomeNoticeStore`：acknowledged/status/saving 状态机 | settings wire | — | 无 |
| `src/client/EditorFooter.tsx` | **编辑卡操作行**：取消（左，禁用仅当 busy）+ 提交（右，文案 apply/applying/create/creating 等） | — | 所有卡片底部复用 | — |
| `src/client/apiKey.ts` | （无 UI）`apiKeyFailure()`：判空/全空白/非法字符（可打印 ASCII `\x21-\x7E`）/拒绝 `NAME=value` 粘贴行或成对引号包裹 | — | 浏览器端校验 | 与 `@deepseek-ai/dsh-llm` normalizeApiKey 孪生 |
| `src/onboarding-copy.ts` | （无 UI）欢迎声明文案（zh/en）+ 命名空间常量 | — | — | `WELCOME_NOTICE_SETTINGS_NAMESPACE='ui-onboarding'` |
| `src/client/locales.ts` | 词典（全页文案：nav/title/intro/编辑/删除/添加/API key 相关/自定义/模型目录/获取模型/onboarding…） | — | — | — |

> **易漏**：API key 输入（写保护、`credentials.set` 而非 settings 段）、端点询问 `llm.discoverModels` 的候选选择 Modal、删除确认 Modal、first-run 两阶段 onboarding（欢迎 + DeepSeek key）、自定义 provider 创建卡、模型目录编辑器的容量 K/M 输入、状态点（configured/missing）。

---

## 4. `ui-settings-plugin-inventory` —— 已安装插件清单（只读）

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/PluginInventorySettingsTab.tsx` | **只读插件清单 tab**：搜索框（IconSearch + 占位“搜索插件”）；标题“插件列表”+ 计数徽章；**两列布局的可展开卡片列表**。每张折叠卡：短模块名标题 + 状态点（仅 enabled，按 fiber phase 彩色）+ “已启用/已停用”tag + chevron。展开：Loader entry id（`<code>`）+ 定义列表（配置状态；enabled 的再加“Cordis 状态”）；loading/empty/无匹配/error+重试 | `ctx.remote.pluginInventory.list()`（懒加载，首次选中 tab） | 注册于 `settings.plugins.tab(id=all, order 10)` | 快照每 Settings 打开/重试一次；本地搜索；禁用项无冗余状态 |
| `src/client/index.ts` | 注册 + `list` 包装 | remote.pluginInventory | 注册 | inject `['slots','locale','remote','remote.pluginInventory']` |
| `src/client/locales.ts` | tab/搜索/load/empty/标签/阶段文案 | — | — | — |

> 阶段文案：未挂载/等待依赖/加载中/已挂载/挂载失败/卸载中。**易漏**：状态点（数据-phase 属性，仅 enabled 显示）、展开的详情定义列表（entryId 无字段标签）。

---

## 5. `ui-settings-plugins` —— Plugins 设置节 + 插件配置卡片

**注册**：`settings.section (id=plugins, order 15)` 渲染 `PluginsSettingsSection`（声明 `settings.plugins.tab` 子 slot）；`settings.plugins.tab (id=configurable, order 0)` 渲染 `ConfigurablePluginsTab`（声明 `settings.plugin.item` keyed 子 slot）；`settings.plugin.item` 注册三张卡（BashCard/AgentLoopCard/WebSearchCard，key=命名空间）。inject `['slots','locale','connection','remote','settingsScope']`。

| 组件/文件 | 渲染内容 | 数据源 | Slot | 备注 |
|---|---|---|---|---|
| `src/client/PluginsSettingsSection.tsx` | **Plugins 页**：标题+介绍、“本部署没有开放任何插件设置”空态；**tab 条**（role=tablist，箭头键切 tab）+ tabpanel（每 tab 首次选中后保持挂载 hidden）| `useTabs`（settings.plugins.tab ledger → 有序 tab） | 渲染于 `settings.section(id=plugins)`；声明 `settings.plugins.tab` | 标签页：Plugin configuration(order 0)、Plugin list(order 10) |
| `src/client/ConfigurablePluginsTab.tsx` | **插件配置 tab**：按命名空间 dispatch `settings.plugin.item`（`<ul>` 卡片列表；空且已加载显示空态）| `useConfigurablePlugins`（served namespaces ∩ 已注册卡片）| 渲染于 `settings.plugins.tab(configurable)`；声明 `settings.plugin.item` | 哪些卡显示 = Host 服务的命名空间 ∩ 有卡认领的 key |
| `src/client/PluginCard.tsx` | **通用插件卡外壳**：header 按钮（名称 + 说明 + 未保存“Unsaved”badge + chevron）展开后显示：只读提示、children 控件、footer（保存失败 alert + 放弃修改 + 保存）；namespace 不可用则整卡不渲染 | `CardShell`（available/writable/dirty/invalid/saving/failed） | `settings.plugin.item` 的渲染 | 未保存草稿跨折叠保留 |
| `src/client/card-form.ts` | （无 UI）`CardForm` 通用表单模型：staged edits、`numberField`/`textField`、`shell()`、`field()`、`actions()`（edit/resetField/save/discard）、revision-fenced 写 + 回读验证 | `SettingsScope` | — | secret 字段（CardSecretSpec）写 credentials 域而非 section |
| `src/client/fields.tsx` | 两个手写控件：**`ValueField`**（label + “已覆盖”badge + “恢复默认”reset + 文本/数字输入 + hint/无效提示）；**`SecretField`**（label + 配置状态徽章 + password 输入，写保护不渲染值）| CardFieldState | 卡内 | — |
| `src/client/BashCard.tsx` | **终端(SHELL)卡**：`PluginCard` 内两个 `ValueField`：命令超时 ms（`timeoutMs`）、单流输出上限 bytes（`maxOutputBytes`）| `bash` 命名空间 scope | `settings.plugin.item(key=shell)` | 同一声明 PowerShell/POSIX 共用 |
| `src/client/bash-card-controller.ts` | `BashCardController`（SHELL_NS='shell'、numberField×2）| — | — | — |
| `src/client/AgentLoopCard.tsx` | **Agent 循环卡**：`PluginCard` 内一个 `ValueField`：并行工具调用数（`maxParallelToolCalls`）| `agent-loop` 命名空间 scope | `settings.plugin.item(key=agent-loop)` | — |
| `src/client/agent-loop-card-controller.ts` | `AgentLoopCardController`（AGENT_LOOP_NS='agent-loop'、numberField×1）| — | — | — |
| `src/client/WebSearchCard.tsx` | **网页搜索卡**：`PluginCard` 内 `SecretField`（API key，写 credentials 域，配置/未配置徽章）+ `ValueField`×2（Endpoint `baseURL`、单请求最大搜索次数 `maxUses`）| `web-search-deepseek` 命名空间 scope + `credentials.describe/set` | `settings.plugin.item(key=web-search-deepseek)` | key 不写 settings 段，从不出现在响应 |
| `src/client/web-search-card-controller.ts` | `WebSearchCardController`（WEB_SEARCH_NS、默认 `DEEPSEEK_API_KEY` ref、credential 刷新）| — | — | 监听 `credentials/updated`（与 Models 页同 ref） |
| `src/client/slot-contract.ts` | （无 UI）声明 `settings.plugin.item` keyed slot 类型 | — | 类型仅 | — |
| `src/client/tab-store.ts` | （无 UI）`ConfigurablePluginsTabController`：served namespaces 读取 + 与卡片 ledger 求交 | `settings.describe` | — | 空态等待首次 Host 回答 |
| `src/client/locales.ts` | 词典（nav/title/intro/tabs/overridden/reset/save/unsaved + 三卡文案）| — | — | — |

> **易漏**：插件卡是**手写控件**（非真 schema 自动渲染，但由 schema 驱动字段集合），每字段“已覆盖”badge + “恢复默认”；secret 字段写凭证域开始即空；未保存徽章；只读部署整卡禁用。

---

## 6. 汇总：可见组件计数

| 包 | 可见组件/表面数 |
|---|---|
| ui-settings | 0（纯机制/契约） |
| ui-settings-general | 4（SettingsRoot 外壳 + 面板、TriggerContent、HeaderContent、CloseLabel、通用页 GeneralSection、打开配置文件操作）→ 约 5 个渲染面（Trigger/Header/Close 合并计 3 个小件） |
| ui-settings-models | ModelsSection 页 + ProviderEditor + DeepSeekModelsEditor + ModelListEditor(+候选 Modal) + CustomProviderCard + EditorFooter + OnboardingModal + WelcomeNotice + DeepSeekOnboardingDialog ≈ **9 个渲染组件** |
| ui-settings-plugin-inventory | 1（PluginInventorySettingsTab） |
| ui-settings-plugins | section 外壳 + tab 条面板 + 通用 PluginCard + 三张插件卡（Bash/AgentLoop/WebSearch）+ ValueField/SecretField ≈ **6~8 个渲染组件** |

**设置页导航结构**：General(0) / Models(10) / Plugins(15)，每个节内 Plugins 又有两个 tab（Plugin configuration / Plugin list）。

**容易被遗漏的**：
1. **凭证管理 UI** —— API key 输入走 `credentials.set`（写保护，`type=password`），settings 段从不携带 key 值；凭密钥状态点/徽章（configured/missing、级联/只读徽章）。
2. **模型发现 / API key 输入** —— “获取可用模型” `llm.discoverModels` 候选 checkbox Modal；ModelListEditor 容量 K/M 后缀输入；first-run 两阶段 onboarding（欢迎声明 + 官方 DeepSeek key 弹窗）。
3. 自定义 provider 创建卡（Provider ID 正则校验 + API 协议下拉从 schema 读）。
4. 删除 provider 的确认 Modal（含是否连带删除凭证说明）。
5. 每个字段层级的“已覆盖 overridden”徽章 + “恢复默认 reset”（插件配置卡）与 inherited/customized 徽章（模型目录）。
6. 只读部署整体禁用态与只读提示。
