# 2026-08-21 — GoalBar 无目标时整条隐藏(含「＋ 设定目标」入口)

## 删除了什么

- GoalBar 的**未设定态整条**:靶标 SVG + 「未设定目标」相位标签 + 右侧「＋ 设定目标」按钮(点击后展开的 goal.create 表单入口)。无目标(idle)时 GoalBar 不再渲染任何 DOM。

## 为什么删

- 用户明确要求:goal-bar 在用户未执行 goal 任务时应该隐藏。
- 对齐官方:官方 dsh web 无目标时不渲染 goal 条——官方 skeleton InputBar 仅以 `hasGoal`(goal 投影非空)做 `/goal` 命令的 hint 消歧(`hint.goal.active`),不存在常驻的「未设定目标」条;zion 的未设定态是风格化阶段的自加形态。

## 替代方案

- 创建目标改走 **`/goal <objective>` 斜杠命令**(InputBar 以 `/` 开头的行派发到 commands.execute;fixture 与真后端的 goal 命令均支持,为官方路径)。
- `GoalBar.tsx` 的 create 表单分支与 `goalActions.create` 在代码中保留(当前无 UI 入口触发),未来如需恢复入口仅需一个触发 `setMode('create')` 的按钮。
- 有目标后的全部功能(相位编舞 / pause↔resume / edit / complete / clear)不受影响。

## 验证方式

- `probe-functional.mjs` 更新:02 断言新会话就绪时 **goal bar 不存在**;07 断言创建前 goal bar 隐藏;随后经输入框键入 `/goal 功能接线验收目标` + 发送,断言 goal bar 出现且相位为 active(09/10/10b),pause/resume/blocked 相回归不变(11/11b/11d/11e)。
