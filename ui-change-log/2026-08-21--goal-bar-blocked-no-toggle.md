# 2026-08-21 — GoalBar 受阻(blocked)相不再显示 pause/resume 切换钮

## 删除了什么

- GoalBar 在 goal 相位为 **blocked(受阻)** 时,zion 此前额外显示的 **resume(恢复)按钮**(`goalActions.resume` 入口)。blocked 相的动作组变为 edit / complete / clear(与官方受阻条一致:官方受阻条无暂停/恢复钮,仅 ✎/🗑;complete 为 zion 保留的扩展入口)。

## 为什么删

- 输入栏合并形态 demo 落地简报(2026-08-21 共识条款 2)明确:**受阻相不显示 pause 钮(对齐官方)**;pause↔resume 为单个切换钮,active 显 ⏸、paused 显 ▶、blocked 不显示。
- zion 此前的 blocked-resume 是复刻期超集(官方 dsh web 的 GoalBar 在受阻相不提供该入口),风格化阶段对齐官方形态。

## 替代方案

- 功能未失:受阻目标的恢复仍可通过 `/goal` 斜杠命令路径达成(goal.* 契约不动);`goalActions.resume` 在 runtime 中保留,paused 相的 ▶ 恢复钮不受影响。
- 若需恢复该入口,改动点仅 `GoalBar.tsx` 显示分支的相位条件一处。

## 验证方式

- `probe-functional.mjs` 更新:新增 blocked 相断言(经 `__zionProbePushMuxFrame` 注入 `session/projection` goal 帧)——`.goal-bar[data-phase="blocked"]` + 相位标签「受阻的目标」+ **不存在** `[data-action="pause"]`/`[data-action="resume"]` 按钮;pause↔resume 切换在 active/paused 相照常回归。
