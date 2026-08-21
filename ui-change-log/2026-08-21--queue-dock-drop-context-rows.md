# 2026-08-21 — QueueDock 不再渲染 placement=context 的队列行

## 删除了什么

- QueueDock 对 **`context` 放置项**的队列行渲染(「上下文」标签 + 预览文本)。典型例子:切换权限预设后宿主推入的 `The approval policy changed from "never" to "ask" (changed by the user).` 通知,此前会以一整行显示在输入栏上方的 queue-dock 中。

## 为什么删

- 官方 dsh web 不显示它:官方 QueueDock(`vendor/client-ui-conversation/client/queue/QueueDock.tsx:33`)只渲染 `placement === 'queued'` 的行;context 放置项是**给 agent 的上下文注入**,被消费后以 `context` 聊天节点进入会话流(官方 `ContextMessageNodeView`)。
- zion 此前把 queued / steering / context 三种放置项全部平铺进 dock,是复刻期的超集呈现,导致权限切换等宿主通知在 UI 上多出官方没有的行。

## 替代方案

- 信息未失:context 项被消费后仍以 context 聊天节点出现在会话流中——复刻 ChatView 已渲染该节点(`ChatView.tsx` 的 `case 'context'`)。
- steering(插队)行**保留**在 dock:复刻 ChatView 暂无官方 pendingSteering 的在途渲染,dock 是在途 steering 的唯一可见处;若后续补齐在途渲染可再对齐。

## 验证方式

- 真后端:切换权限预设(如 Full access ↔ Workspace Write),queue-dock 不再出现「上下文 The approval policy changed…」行;该通知在被消费后于会话流中以 context 节点可见。
- 回归:queued 行的 编辑/插队/移除 与 steering 行渲染不变(probe-checklist 队列相关项)。
