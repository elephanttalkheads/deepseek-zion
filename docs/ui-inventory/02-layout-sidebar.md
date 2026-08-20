# G2 布局与侧栏盘点

盘点对象（仓库根 `D:\github-Clone\deepseek-harness\packages\client\`）：
`ui-layout`（三栏布局外壳）、`ui-sidebar`（左侧栏）、`ui-workspace`（工作区/会话浏览）、`ui-attachment`（附件原子组件，纯 React，零 Cordis，实际由 ui-conversation 消费）。

> 说明：`ui-layout` 是 `root` 槽位的**注册者**（布局消费者），它声明了 `sidebar`/`conversation`/`details`/`shell.overlay` 四个子槽位；`ui-sidebar` 作为 `sidebar` 槽位的占位者再声明 `sidebar.workspaces`/`sidebar.settings`/`sidebar.footer.action`；`ui-workspace` 注册到 `sidebar.workspaces`（侧栏浏览器）与 `conversation.hero.workspace`（空状态拾取器）。

---

## 包：ui-layout（三栏布局外壳，`@deepseek-ai/dsh-client-ui-layout`）

作用：浏览器单页外壳。注册 `AppFrame` 进运行时内置的 `root` 槽位，声明四个子槽位，坐入布局 store（面板几何），提供跨插件面板动作服务 `ctx.layout`，并坐入主题 presenter（把 `ctx.theme` 快照投影到 document）。**不注册/不消费 slots 之外的业务服务**；纯浏览器，host 侧 `apply()` 为空。

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| `src/client/AppFrame.tsx` — **AppFrame** | 三栏 `grid-template-columns: sidebar px / minmax(0,1fr) center / details px` 外壳；渲染 `sidebar`、`conversation`、`details`、`shell.overlay` 四个子槽位；两个拖拽把手（sidebar/details）；折叠时的 56px 收缩轨道 | `useStore`（面板宽窄）、`useSessions`（当前会话）、`renderSlot`、`actions` | 注册于 `root` 槽；声明 4 子槽 | 三栏收缩由 `computeColumns`（columns.ts）裁决；窄视口(<1024)自动折叠侧栏；切换会话自动关 details。AppFrame 内部还含局部组件 `CenterColumn`、`DetailsColumn`、`DragHandle`（私有，不导出） |
| `src/client/columns.ts` — 纯求解器（无 UI） | — | — | AppFrame 内部调用 | 固定几何常量：CENTER_MIN=640、SIDEBAR_MIN=264、SIDEBAR_MAX=420、SIDEBAR_DEFAULT=280、SIDEBAR_COLLAPSED=56(轨道)、SIDEBAR_AUTO_COLLAPSE=1024、DETAILS_MIN=300、DETAILS_MAX=520、DETAILS_DEFAULT=360。让步链：先缩 details，再自动关 details（派生 0 宽，不改偏好），中心吸收剩余亏空；侧栏永不缩 |
| `src/client/stores.ts` — `createLayoutStore` | —（状态工厂，无 UI） | defineStore 引擎 | 作为 `root` 注册的 `store:` 工厂，经注入钩子把绑定 actions 交给 `LayoutController` | 状态：`{sidebar, details, narrow, narrowExpanded}`，宽度 px（0=关）。动作：setSidebar/setDetails/toggleSidebar/setNarrow/openDetails/closeDetails。关闭面板会忘记拖宽，重开恢复契约默认；窄视口下 toggle 翻转 `narrowExpanded` 而不改宽度偏好；**不读写 localStorage（瞬态）** |
| `src/client/service.ts` — **LayoutController / ILayout（`ctx.layout`）** | —（服务，无 UI） | 由注入钩子附加 store 绑定 actions | `ctx.layout` 跨插件面板动作契约 | 暴露 `toggleSidebar()`/`openDetails()`/`closeDetails()`；未 wiring 时调用抛错 |
| `src/client/theme-presenter.ts` — **ThemePresenter**（无 React UI） | 把 `ctx.theme` 快照投影到 DOM：`html{color-scheme}`、`body[data-ds-dark-theme]`、主题别名 token 作为 body 内联 CSS 变量、一个属主的 `<meta name="theme-color">` | `ctx.theme.getTheme()` + `theme/change` 事件 | 由 `apply` 第二个 effect 坐入 | 纯 DOM 写；关停时只收回自己写的东西 |
| `src/client/index.ts` — 客户端插件入口 | 装配：`reflect.provide('layout')` + `slots.register('root', …, AppFrame)` + 主题 presenter | ClientContext | 同时声明 4 个子槽位与 owner share（见下） | `export const inject = ['slots','theme']`。只导出 `LayoutController`/`ILayout` 与 owner-share 类型 |

**声明的槽位（owner share）**：`sidebar`（single/root，owner:`SidebarOwnerProps {collapsed,width}`）、`conversation`（single/session-maybe，owner:`ConvOwnerProps {}`）、`details`（single/session，owner:`DetailsOwnerProps {}`）、`shell.overlay`（list/root）。

**行为要点**：
- 布局切换：`toggleSidebar()` 折叠→56px 轨道 / 展开→契约默认宽；`:root` 槽的拖动把手捕捉指针（rAF 节流 dx）；details 拖动把手同样。
- "concession" 自动关 details：窗口变窄时 details 缩到最小再自动关（派生 0 宽，不改偏好）；窗口变宽自动恢复。
- 跨会话切换：切到另一 Session 前先关 details；Hero/未选中态 details 以 0 宽渲染但不改已存偏好。
- 主题就是这样全局应用的（非本栏 UI，但对重建 DEMO 很重要：`AppFrame` 之外 body 会被写入主题变量与暗色属性）。

---

## 包：ui-sidebar（左侧栏外壳，`@deepseek-ai/dsh-client-ui-sidebar`）

作用：左侧栏外壳。渲染品牌行、新建会话动作、布局属主的折叠控制、滚动感知区域座位、底部固定 Settings 座位。**不拥有工作区/会话列表数据**（由 ui-workspace 注册进 `sidebar.workspaces`）；无 store。host 侧 `apply()` 为空。

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| `src/client/SidebarRoot.tsx` — **SidebarRoot** | 侧栏列柱：logo 行（品牌字标→新建会话按钮 / 折叠时鲸鱼标+面板图标=展开开关）、"新建会话"按钮、中部浏览区（`sidebar.workspaces`）、底部 `sidebar.footer.action` 动作堆 + `sidebar.settings` 座位；滚动条指针跟随（.quietBars） | 布局 owner share（`collapsed,width`）、渲染子槽位、注入回调（`startSession`,`toggleSidebar`）、locale | 注册进 `sidebar` 槽（ui-layout 声明） | 折叠动画：宽内容冻结在原宽→150ms 淡出→300ms 列滑动，轨道 56px；底部 settings 只淡出不平移；加载即折叠则静态轨道；reduced-motion 关闭过渡 |
| `src/client/contract/slots.ts` — 槽位契约 | —（仅类型） | — | 声明 `sidebar.workspaces`(single/root)、`sidebar.settings`(single/root)、`sidebar.footer.action`(list/root) | owner share：`SidebarSectionOwnerProps {wide, expandSidebar}`、`SidebarSettingsOwnerProps {wide}`、`SidebarFooterActionOwnerProps {wide}`；注入：`SidebarRootInjected {startSession,toggleSidebar}` |
| `src/client/locales.ts` | —（字典） | — | `sidebar` 命名空间 | zh/en 各 4 键：新会话/新建会话/收起/打开侧边栏 |
| `src/client/index.ts` | 注册字典 + `slots.register('sidebar', children:…, SidebarRoot)` | ClientContext | 声明 3 子槽；注入 `startSession`(ctx.workspaces)、`toggleSidebar`(ctx.layout) | `export const inject = ['slots','layout','sessions','workspaces','locale']` |

**侧栏组成（重点）**：
- 顶部 logo 行：宽态 = 品牌字标（BrandWordmark，点击=新建会话）；折叠轨道 = 鲸鱼标（hover 换面板图标，点击=展开），`FishLogo` + `IconPanelLeftOutline16`。
- 「新建会话」按钮：`IconNewChatOutline16` + 本地化文案（宽态），折叠时仅图标（轨道 36px 控件）。
- 中部浏览区 `sidebar.workspaces`（ui-workspace 填充，见下）。
- 底部 `sidebar.footer.action`（list 槽位，可多个动作）+ `sidebar.settings`（ui-settings 注册触发行+面板）。
- 折叠：宽内容 150ms 淡出+49px 左移进轨道（4 个上部控件共享），轨道每个 36px 控件盒走同一路径到 10px 左内缩距；settings 只淡出。
- 滚动条指针跟随：指针离开列后 2s 保持绘制（SCROLLBAR_LINGER_MS），用 ui-theme 的滚动条重绑定到 transparent。

---

## 包：ui-workspace（工作区/会话浏览，`@deepseek-ai/dsh-client-ui-workspace`）

作用：共享工作区浏览器与拾取器。`WorkspaceBrowser` 填 `sidebar.workspaces` 槽（整个浏览区：标题头、搜索、分组/平铺会话列表、工作区对话框）；`WorkspacePicker` 填 `conversation.hero.workspace` 槽（空状态拾取菜单）。两者都用同一 Workspace 菜单与添加流程（`WorkspacePickFlow`）。host 侧 `apply()` 为空。

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| `src/client/WorkspaceBrowser.tsx` — **WorkspaceBrowser** | 浏览区根：section 头（title + ViewOptionsMenu + Add-Workspace 按钮 + 搜索结果）、搜索槽（展开/收起的搜索框）、列表区（`SearchResults`/`FlatList`/`SessionTree` 三态之一）、3 个 Modal（重命名工作区/重命名会话/删除工作区确认） | `useSessions`/`useWorkspaces`/`useStore`（浏览视图 store）、注入回调、locale `workspace` | 注册进 `sidebar.workspaces` 槽；声明子槽 `sidebar.workspaces.directoryFlow` | 内部私有组件：`SessionTree`、`FlatList`、`SearchResults`、`ViewOptionsMenu`、native-drag hooks |
| `src/client/WorkspacePicker.tsx` — **WorkspacePicker / WorkspacePickFlow** | 工作区拾取/添加流程：拾取菜单（已列工作区 + 置底的"添加工作区…"）+ 采纳失败错误对话框（"重新选择"重开流程）；空状态适配 | `useWorkspaces`、`useDirectoryFlow`（occupied 状态）、注入 `createWorkspace`、locale | `WorkspacePicker` 注册进 `conversation.hero.workspace` 槽，声明 `conversation.hero.workspace.directoryFlow`；`WorkspacePickFlow` 为核心可复用组件 | 无工作区时的"单入口"行为：锚手势直接开流程而无单行弹窗；空列表待 baseline 后才算最终。Directory flow 由组合的拾取包客户端填充槽位 |
| `src/client/rows/Rows.tsx` — **ProjectRowItem / SessionNodeItem / SearchResultItem / WorkspaceHoverContent / SessionHoverContent / SessionStatusDots** | 行组件（figma Cell 14:3080）：工作区组头行（folder+标题+chevron+悬停动作）、会话行（状态点+标题+相对时间+省略号菜单）、搜索结果行 | 全部经 props（纯表现组件） | —（无槽注册；被 tree 渲染调用） | 悬停开关（folder→chevron、time→ellipsis 等）纯 CSS；菜单仅重命名/删除/分叉/归档真实生效 |
| `src/client/tree.ts` | —（推导逻辑，无 UI） | Session/Workspace 快照 | WorkspaceBrowser 内部调用 | `deriveGroups`（分组）、`deriveFlat`（单列表）、`deriveSearchResults`（搜索合并）、`relativeTime`（相对时间分桶）、UNGROUPED_KEY=``/UNGROUPED_LABEL |
| `src/client/stores.ts` — `createWorkspaceViewStore` | —（浏览视图 store） | defineStore + `persist: 'dsh.workspace.view.v5'` | WorkspaceBrowser 注册的 store | 状态：`{groupBy, orderBy, groupExpansion, sessionOrderByAccount, sessionUpdatedAtByAccount}`。分组模式 workspace/flat，排序 manual/updated。**可持久化（localStorage）**，与 ui-layout 的瞬态 store 不同 |
| `src/client/contract/slots.ts` | —（槽位契约类型） | — | 声明 `conversation.hero.workspace.directoryFlow` / `sidebar.workspaces.directoryFlow`（single/root，owner:`DirectoryFlowOwnerProps{open,busy,onPicked,onCancel,onError}`） | 注入契约：`WorkspaceBrowserInjected`、`WorkspacePickerInjected` |
| `src/client/locales.ts` | —（字典） | — | `workspace` 命名空间 | zh/en 各 ~60 键：分组/排序/搜索/菜单/状态/相对时间 |
| `src/client/index.ts` — 客户端插件入口 | 注册字典 + `slots.inject` 两个注册（browser 与 picker） | ClientContext | 注入回调绑定 `ctx.sessions`/`ctx.workspaces` actions | `export const inject = ['slots','sessions','workspaces','locale']`；用 `slots.inject` 等待声明槽生命周期 |

**工作区浏览器行为（重点）**：
- **分组/展开**：默认按工作区分组（`groupBy='workspace'`），一个工作区记住开/关态（`groupExpansion`）；打开的工作区默认显示 5 个会话（`COLLAPSED_SESSION_LIMIT=5`），超出显示瞬态"Show more"（`sessions.expand`）控件，整个工作区关闭重开后回到 5 个。Ungrouped 桶（`UNGROUPED_KEY`）显示未分配会话。
- **排序**：默认 `orderBy='updated'`；`Manual` 手动/`Last updated` 最近更新，两种都可用于分组或平铺。进 Last updated 做一次完整 recency 排序，之后用户提问/steer 会单次置顶该会话；进 Manual 保存当前所有位置并禁用后续置顶。拖动编辑当前顺序；Manual 下真工作区拖动也写 Host 会话账号，Ungrouped/平铺顺序仅浏览器本地。**工作区拖动顺序 Host 持久**。
- **平铺（flat）**："In one list"（`groupBy='flat'`）：每个会话一个顶级行，严格 recency 排列，无父子邻接；平铺行省略空状态槽位。
- **搜索**：头部一个动作展开搜索框（折叠轨道中搜索/添加为 36px 控件，点击先展开侧栏再聚焦）。非空查询替换浏览模式为一个扁平结果列表：大小写不敏感标题+工作区子串匹配立即出现；250ms 防抖 Host 请求加排名内容匹配与摘要。查询上限 500 UTF-16 码元、去 NUL、不拆代理对；新查询中止前请求；结果上限 20 并提示收窄；点击结果打开会话不清查询。
- **会话行外观**：34px 行：状态点（pending interaction 琥珀警告点 > 运行蓝点 > 未查看完成绿点 > 子代理运行计数；待审批="Waiting for approval"/计划待审="Plan awaiting review"/等待回答="Waiting for answer"）+ 标题 + 相对时间（"刚刚"/"5分钟"/"3小时"…）+ 省略号=行菜单（重命名/分叉/归档）。Arc/hover 卡复制标题或路径。Fork 在源最后完成 turn 处分叉并自增继承标题。
- **添加工作区**：头部 Add-Workspace 按钮 → `WorkspacePickFlow` 目录流程（`addOnly` 于侧栏）；采纳的路径经 `createWorkspace({path})` 变为真 WorkSpace。目录流程孔被组合的拾取包客户端（如 `directory-picker-native`）填充。
- **对话框**：重命名工作区（拒绝重名）、重命名会话（空标题禁止，未变标题允许=固定自动标题）、删除工作区（确认，删除后会话落入 Ungrouped）。归档会话无对话框（不破坏性）。

---

## 包：ui-attachment（附件原子组件，`@deepseek-ai/dsh-client-ui-attachment`）

作用：纯 React 附件原子组件，**零 Cordis**（不注册槽、不读应用状态、无 host/client 身体；`index.ts` 仅 re-export）。当前消费者是 `@deepseek-ai/dsh-client-ui-conversation`（经其 `image-labels` 模块注入 label props）。不直接属于布局/侧栏，但被聊天界面使用，常随三栏一并展示——重建 UI demo 时需一并还原。

| 组件/文件 | 渲染内容 | 数据源 | Slot/机制 | 备注 |
|---|---|---|---|---|
| `src/AttachmentRail.tsx` — **AttachmentRail** | 草稿附件横向缩略图轨道：固定 64px 缩略图（16px 圆角）单行横向滚动（滚动条隐藏）；溢出由左右圆形边缘箭头分页 | 经 props（`items`/`labels`/`onOpen`/`onRemove`） | —（无槽） | 仅横向滚动（wheel 纵向被消费转横向 60px/步条）；新增加载末尾显示；移除保持 scroll 位置；ResizeObserver 跟踪轨道宽；reduced-motion 用 instant |
| `src/MessageImage.tsx` — **MessageImage / ImageGallery** | 聊天历史图片：单图（`variant="single"`）长边 240px、宽高比 [0.25,4] 内 cropped（cover，超高顶部、超宽左侧锚定），不大于自然尺寸；多图（`variant="tile"`)固定 64px 方块。加载失败显示重试控件；点击打开灯箱 | `attachment`(ImageAttachmentRef)、`load`(ImageLoader 会话授权 URL)、labels | —（无槽） | `ImageGallery` 按图片数选 variant，空列表渲染 null |
| `src/ImageLightbox.tsx` — **ImageLightbox** | 文档级原始图灯箱：body portal、遮罩（`--dsw-alias-bg-mask-1`+`--dsw-mask-blur`）、fit-to-viewport 原图、关闭按钮；Escape/遮罩/关闭退出并恢复焦点 | `src`/`alt`/labels/`onClose` | body portal（React createPortal） | 不 trap focus（遗留行为）；卸装恢复 opener 焦点 |
| `src/DropOverlay.tsx` — **DropOverlay** | 全视口拖放邀请层：插图（倾斜照片卡 SVG）+ 标题 + 限制行（`disabled` 换拦截图、隐去 limits 行）；pointer-inert | `disabled`、labels | body portal | 只展示状态；enter/leave 计数与 accept/reject 由 owner 文档级监听决定 |

（注：`src/invariant.ts` 与 `src/css-modules.d.ts` 为非渲染辅助/类型文件。）

---

## 槽位注册链小结（重建 UI 时按此组装）

```
root (运行时内置)
 └─ ui-layout → AppFrame                       [声明 4 子槽 + 布局 store + ctx.layout + 主题 presenter]
     ├─ sidebar (single/root)  ← ui-sidebar → SidebarRoot
     │    ├─ sidebar.workspaces ← ui-workspace → WorkspaceBrowser
     │    │    └─ sidebar.workspaces.directoryFlow ← 组合拾取包客户端（native/browse）
     │    ├─ sidebar.settings  ← ui-settings（本盘点范围外）
     │    └─ sidebar.footer.action (list) ← 各动作注册者
     ├─ conversation (single/session-maybe) ← ui-conversation（范围外，含 hero 空状态）
     │    └─ conversation.hero.workspace ← ui-workspace → WorkspacePicker
     │         └─ conversation.hero.workspace.directoryFlow ← 组合拾取包客户端
     ├─ details (single/session) ← ui-conversation → DetailsPanel（范围外）
     └─ shell.overlay (list/root) ← 各全局覆盖层
```

可见 UI 组件计数：**ui-layout** 6（AppFrame 及内部 3 个局部组件 + LayoutController/ILayout 服务 + ThemePresenter；纯 UI 可渲染主要为 AppFrame 与其内部 CenterColumn/DetailsColumn/DragHandle）；**ui-sidebar** 1 个可见根组件 SidebarRoot（含若干内部控件）；**ui-workspace** 4 个导出/核心组件（WorkspaceBrowser、WorkspacePicker、WorkspacePickFlow、rows 的 3 个行组件）及其内部 SessionTree/FlatList/SearchResults/ViewOptionsMenu；**ui-attachment** 5 个导出组件（AttachmentRail、MessageImage、ImageGallery、ImageLightbox、DropOverlay）。
