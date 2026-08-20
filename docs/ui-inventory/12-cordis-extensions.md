# G12 Cordis 运行时 UI 盘点（extensions/ui-cordis）

> 范围：`D:\github-Clone\deepseek-harness\packages\extensions\ui-cordis`（不在 `packages/client` 下，常规 client 盘点易遗漏）。
> 作用：把 **Cordis 动态插件**（本会话的 cordis_define/cordis_run/cordis_stop/cordis_undefine/cordis_inspect 等工具）在对话流与侧栏里渲染成可操作卡片 + 一个插件控制面板。

## 数据/服务

- `ctx.dynamicCordisRunner` / `ctx.remote.dynamicCordisRunner`：插件定义/运行/停止/清单/检查的 Remote。
- `ctx.inputTriggers`：/ 命令触发（`UI_TRIGGER_SLASH`）——插件命令也走 / 触发管线。
- slot 契约：`tool.call.toolview`（keyed，按 wire tool 名）、`tool.view.cordis`（keyed，仅 key `self`，绑定 pluginId+packageId）、`sidebar.footer.action`（list，插件面板入口）、`conversation.chat.node`（命令行只在 ui-conversation 侧）。

## 可见组件

| 组件/文件 | 源码位置（`packages/extensions/ui-cordis/src/client/`） | 渲染内容 | Slot | 备注 |
|---|---|---|---|---|
| **CordisDefineRow** | `CordisDefineRow.tsx` | `cordis_define` 工具行卡片：代码/定义预览 + 返回的 pluginId/packageId + 下步动作行 | `tool.call.toolview` key=`cordis_define` | 展示 define 的不可变 Package 概要 |
| **CordisRunRow** | `CordisRunRow.tsx` | `cordis_run` 工具行卡片：激活状态（run/update）、**运行卡承载 `tool.view.cordis`**（键 `self`）、审批态 | `tool.call.toolview` key=`cordis_run` 等；内含 `tool.view.cordis` 渲染 | 运行卡 UI 经 `renderSlot('tool.view.cordis')` 挂到本次运行 |
| **CordisPanel** | `CordisPanel.tsx` | 侧栏插件控制面板：插件清单（pluginId/packageId/状态）/ 定义 / 启停 / 检查 | `sidebar.footer.action`（id 含 cordis） | 面板弹出式，与设置同侧栏底部 |
| **CordisActionRow** | `CordisActionRow.tsx` | 面板内每插件一行的操作/状态行 | 面板内部 | — |
| run-card-index / status / events / inventory | 各 `.ts` | 运行卡索引、状态机、事件、清单（机制，无独立 UI） | — | 支撑组件 |

## 已注册的 tool.call.toolview key（来自 index.ts）

- `cordis_define` → CordisDefineRow
- `cordis_run` / `cordis_stop` / `cordis_undefine`（及 `cordis_inspect_*` 家族）→ CordisRunRow
- 命中即完全接管；未注册的 cordis 类工具名走 ui-tool 的 GenericToolCard 分类。

## 易遗漏要点

1. 该包在 `packages/extensions/` 而非 `packages/client/`，源码扫描按目录盘点时会漏。
2. `tool.view.cordis` 的 key 是**固定的 `self`**（Guard 绑定），不是任意 key——重建 demo 时别按任意 key 注册。
3. 运行卡的交互状态包括 awaiting-approval / starting / success / technical-failure，需映射到视觉状态。
4. 插件面板入口在 `sidebar.footer.action`（list 槽），与 ui-jobs/agent-preset 的会话头 button 不在同一个槽。
