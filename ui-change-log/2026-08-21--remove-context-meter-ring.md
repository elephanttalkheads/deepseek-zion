# 2026-08-21 — 移除 composer 尾部的 ContextMeter 上下文占用环

## 删除了什么

- 输入栏底部(`.input-bar-foot`)的 **ContextMeter 上下文占用环**(vendor `ContextMeter`,`contextPressure` + `contextBreakdown` 投影;点击环可展开「系统提示词/工具/对话消息」组成面板),即 `InputBar.tsx` 的 `<ContextMeterSeat/>` 挂载点与 `composer-stats.tsx` 的 `ContextMeterSeat` 适配组件。

## 为什么删

- 输入栏合并形态 demo(`ui-prototype/input-bar/input-bar-proto.html`)评审裁决(2026-08-20,用户在 demo 评审中明确):**去除 ContextMeter 环,ctx 占用只留微簇的胶囊条**;落地简报(2026-08-21)再次确认「ContextMeter 环删除」。
- 环与微簇胶囊条展示同一事实(ctx 占用),官方语义「one home per fact」(vendor StatsLine 注释同源),保留两处属冗余。

## 替代方案

- ctx 占用展示以微簇既有胶囊条为准(样式改写无法解决「同一事实两处展示」的评审裁决,故走删除 + 立账)。
- 数据层不动:`contextPressure` / `contextBreakdown` 投影仍由官方运行时正常订阅,仅不再渲染该环;若后续恢复,`ContextMeterSeat` 可从 git 历史还原(vendor `ContextMeter.tsx` 本体未改)。

## 验证方式

- `probe-composer-stats.mjs` 更新:C4 改为断言「占用环按钮不存在 + StatsLine 位于输入框底部(`.input-bar-foot` 之后)」;原 C4/C5(环渲染/组成面板)断言删除。
- `probe-checklist.mjs` 24 项回归 + `npm run typecheck` 基线对照(不新增错误文件)。
