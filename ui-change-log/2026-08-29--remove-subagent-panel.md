# 2026-08-29 — 删除右栏子代理面板 SubagentPanel(对齐官方 UI)

## 删除了什么

- 右栏(`aside.app-details` → `DetailsPanel`)的 **SubagentPanel 子代理面板**(zion 附加,zion-add):选中会话时渲染选中会话的直接子代理目录(`subagents.list` 经 `wire.sessions.refreshSubagents` → `snapshot.subagentsByParent`),含:
  - 「子代理」标题 + 「刷新」按钮(→ `refreshSubagents`);
  - 每行 label/activity 徽标(运行中/空闲)/「有子级」徽标;
  - continuable 子代理的投递输入(Enter)+「发」(`subagents.prompt`)+「中断」(`subagents.interrupt`)按钮;
  - 空态/加载/失败/投递反馈文案。
- 连带删除:
  - `renderer/src/ui/SubagentPanel.tsx`(117 行,组件本体);
  - `DetailsPanel.tsx` 中 `<SubagentPanel/>` 挂载与 import;
  - `styles/chat-panels.css` 的 `.subagent-panel*` 全部规则(19–52 行);`.details`/`.details-muted` 保留;
  - `app/runtime.tsx` 的 `SubagentActions` 接口 / `AppRuntime.subagentActions` 字段 / `subagentActions` 实现(唯一消费者即 SubagentPanel;`wire.sessions.refreshSubagents` 与 `wire.api.subagents.*` 契约不动,目录树与官方运行时仍消费)。

## 为什么删

- **用户裁决(2026-08-29)**:删除右侧子代理面板,**对齐官方 UI**。官方 3080 右栏(`client-ui-conversation/skeleton/DetailsPanel.tsx`)= 工具详情面板(选中工具调用显示 args/result),**无子代理面板**;官方把子代理放会话头目录树 + 只读 composer + 会话层级面包屑。
- 上一轮(会话层级面包屑轮)曾裁定「SubagentPanel 保留(zion-add,官方替代=目录树+只读+层级)」;本轮用户推翻该裁定:右栏列表与官方目录树是**同一事实的两处展示**(冗余),且非官方形态。

## 替代方案

- 官方子代理入口**全部保留**,不受影响:
  1. 会话头**目录树**(`SubagentCatalogActionSeat`,`app/subagent.tsx`):计数徽标、展开/打开子级(`openChild=selectSession`)、刷新、计时与 token 度量;
  2. **只读 composer**(`SubagentReadOnlySeat`,priority -10):one-shot 寻址子代理/父离线未运行的可继续子代理 → 官方同款只读提示;
  3. 会话头「会话层级」**面包屑**(`nav.conversation-header-crumbs`):点祖先段回主会话;
  4. Sidebar `origin !== 'subagent'` 过滤(子代理会话不进侧边栏,官方 ui-workspace 语义)。
- 投递/中断/刷新按钮随之删除:官方 GUI 无这些入口(目录树仅 openChild);`subagents.prompt`/`subagents.interrupt` **RPC 契约零改动**(R2),宿主运行时仍需,git 历史可回溯恢复面板。
- 右栏当前 L6(官方工具详情面板)未实现,维持占位:`No selection` + `details-plugins` 插件槽(`SlotAnchor settings.plugin.item`,slot 不可删)。

## 验证方式

- `probe-functional.mjs`:16 号断言改反向(`!document.querySelector('.subagent-panel')`,右栏对齐官方),17 号改「`.details` 占位仍在」;原「面板渲染/刷新按钮存在」断言删除。
- `probe-subagent.mjs`(fixture 7/7 + real 7/7):目录树/只读 composer/面包屑回归,不依赖右栏。
- `probe-checklist.mjs` 24/24(chk 22 查 `.details`,仍在);`probe-queue-ops` 查 `.details-plugins`,仍在。
- `npm run typecheck` 基线对照:src/ 零新增错误。
- `npm run build:web` + `probe-functional-out/functional.png` 目测:右栏无子代理面板、`details-plugins` 槽仍在。
