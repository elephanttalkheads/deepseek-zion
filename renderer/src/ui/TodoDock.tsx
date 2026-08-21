/**
 * TodoDock — composer dock 排的 plan strip(2026-08-21 Matrix 风格化,自研,
 * 替换 vendor TodoDock 席位;vendor 文件零改动)。数据与 vendor 同一来源:
 * `todos` 投影(useProjection 桥,见 runtime.tsx)。
 *
 * 结构 1:1 对官方 TodoPanel:整头可点 button[aria-expanded] + 「任务」label +
 * 计数汇总 + chevron;点击向上展开任务列表(逐行 staggered 显影)。默认收起、
 * 展开态不持久(组件内 state,对齐官方);空列表/键缺失 → 不渲染。
 * 视觉照 ui-prototype/input-bar/input-bar-proto.html 的 .tododock(✓/◐/○ 状态
 * 字形 + 磷光绿/近白绿/暗绿语义色),类名按真组件体系(.todo-dock*)。
 */
import { useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
// Type-only:拉入 ts-types 的 SessionProjectionMap 'todos' 键 merge(原由 vendor
// TodoPanel 的同款 import 带入编译面;自研替换后由本文件承接)。
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'

/** 状态字形(demo TODO_ICON):completed ✓ / in_progress ◐ / pending ○。 */
const STATUS_GLYPH: Record<TodoItem['status'], string> = { completed: '✓', in_progress: '◐', pending: '○' }

export function TodoDock(): JSX.Element | null {
  const { useProjection } = useRuntime()
  const todos = useProjection('todos')
  const [expanded, setExpanded] = useState(false)
  if (todos === undefined || todos === null || todos.length === 0) return null

  const done = todos.filter(item => item.status === 'completed').length
  const doing = todos.filter(item => item.status === 'in_progress').length
  const pending = todos.length - done - doing

  return (
    <section className="todo-dock" data-testid="todo-panel" data-expanded={expanded || undefined} aria-label="任务">
      <button
        type="button"
        className="todo-dock-head"
        aria-expanded={expanded}
        aria-label="任务面板：展开/收起"
        onClick={() => setExpanded(v => !v)}
      >
        <svg className="todo-dock-icon" width={14} height={14} viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2 3h10M2 7h10M2 11h6" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <circle cx="11.5" cy="11" r="1.3" fill="currentColor" />
        </svg>
        <span className="todo-dock-label">任务</span>
        <span className="todo-dock-counts">
          <span className="todo-dock-count-done">{done} 已完成</span>
          {' · '}
          <span className="todo-dock-count-doing">{doing} 进行中</span>
          {' · '}
          <span className="todo-dock-count-pending">{pending} 待处理</span>
        </span>
        <span className="todo-dock-chev" aria-hidden="true">⌃</span>
      </button>
      {expanded && (
        <ul className="todo-dock-list">
          {todos.map((item, index) => (
            <li
              key={item.content}
              className="todo-dock-item"
              data-status={item.status}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <span className="todo-dock-glyph" data-status={item.status} aria-hidden="true">{STATUS_GLYPH[item.status]}</span>
              <span className="todo-dock-text">{item.content}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
