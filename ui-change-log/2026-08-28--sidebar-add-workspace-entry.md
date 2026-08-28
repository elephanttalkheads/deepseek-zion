# 2026-08-28 — Sidebar 新增「添加工作区」入口(ASCII 会话城迁移)

## 变更

新增工具条按钮 `.sidebar-add-workspace`(⌂)→ 打开 `WorkspaceDirectoryBrowser`(ui-directory-picker-browse Miller 目录浏览弹窗)→ 创建/添加工作区。

## 为什么

- ASCII 会话城迁移的决策过堂中,用户裁决**补上**官方侧栏的「添加工作区」按钮(官方 3080 侧栏有,zion 清单 A2 未收、复刻旧 Sidebar 也没有)。
- 不是删除,是新增入口;按铁律记录在此。

## 实现

- 复用既有 `WorkspaceMenu` 的创建路径:`renderer/src/app/directory-browser.tsx` 的 `WorkspaceDirectoryBrowser`,零新 RPC、零语义改动。
- 落点:`renderer/src/ui/Sidebar.tsx`(工具条第五个按钮)。

## 验证

- probe-checklist / probe-sidebar-* 回归(探针联动同步更新)。
- 真后端 3080:点 ⌂ → 目录浏览弹窗出现 → 选目录创建工作区 → 城市新区块出现。
