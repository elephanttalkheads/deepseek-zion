# Sidebar(ASCII 会话城)落地决策记录 — 2026-08-28

迁移流程第 3.5 步落字。demo: `ui-prototype/sidebar/sidebar-proto.html`(形态基准 = `replica/` 七态截图)。

## 已裁决条款

1. **落地形态**:`renderer/src/ui/Sidebar.tsx` 整体重写为 ASCII 城市(工具条 + 城市 + City Index + footer),旧列表结构删除;旧探针断言同步重写,不留双视图。
2. **会话状态色**:真实二态——running → STREAMING(青 `#68e9dd`),其余 → READY(绿 `#42ff85`);THINKING/TOOL/ERROR 无真实数据源,不映射、不伪造(R4)。
3. **「添加工作区」按钮**:补上(对齐官方;zion 清单 A2 未收,属新增入口,需接 workspace 创建面,落地时在 `ui-change-log/` 记一笔新增说明)。
4. **子会话 caret**:接真实 lineage(`parentSessionId` 父子关系),索引内展开/收起,语义同官方行内 caret。
5. **多余入口保留**(第 2 步裁决):相机行走输入(W/S/A/D+方向键/滚轮/空白拖拽)、City Index 家族(CITY INDEX 按钮 + M/Esc + BAY 头)、右缘拖拽调宽 280–420px。
6. **缺失入口安置**:固定工具条(搜索/视图选项/新建/⚙/添加工作区)+ 索引行内(⋯菜单/caret/拖拽/+N)+ footer SlotAnchor。
7. **2026-08-28 demo 迭代**:map-stylebar 删除(无分组/平铺切换按钮);索引内点会话只选中不跳相机;LOCATE 按钮显式跳转。
8. **体验档位**:跟随系统 `prefers-reduced-motion`,无手动切换入口(源原型已删切换器)。
9. **语义零改动红线**:全部动作走既有数据面(`useSessions`/`selectSession`/`createSession`/`sessionRowActions`/`workspaceActions`/`SlotAnchor`),只动结构+视觉;重命名走 vendor `Modal`(RenameSessionModal 保留)。

## 拆分(按源设计文档 §14)

```
Sidebar.tsx(壳:工具条 + CityFrame + CityIndex + footer)
├── useWorkspaceCityModel   workspaces+sessions → 稳定 x/z 坐标(z=index 单调,x 左右交替)
├── useCityCamera           camera/target/activeWorkspace/键盘滚轮拖拽
├── AsciiCityCanvas         雨/街道/建筑点云/投射口/雾(aria-hidden)
├── ProjectedLayers         district-marker + session-portal 按钮层
└── CityIndex               DVD 菜单索引(⋯菜单/caret/拖拽/+N/LOCATE)
```
