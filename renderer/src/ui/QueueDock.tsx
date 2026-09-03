/**
 * M3/M5 — QueueDock (Q19A self-authored presentational layer).
 *
 * Renders the selected session's transient inbox snapshot (snapshot.queue):
 * queued / steering placements the host pushes during and across turns, plus
 * per-row queue mutations (remove / steer / edit 行内编辑) for queued items.
 * Also surfaces the session feedback strip: lastAgentError.
 *
 * 2026-08-21 对齐官方:context 放置项(如 approval policy changed 通知)不在
 * dock 渲染——官方 QueueDock 只渲染 placement==='queued';context 项被消费后
 * 以 context 聊天节点进入会话流(复刻 ChatView 已渲染该节点)。steering 行
 * 保留:复刻 ChatView 暂无 pending-steering 渲染,dock 是其唯一可见处。
 */
import { useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import { StatusIcon } from './status-icon.tsx'

const PLACEMENT_LABELS: Record<string, string> = { queued: '待发送', steering: '插队' }

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map((b) => {
    const block = b as { type?: string; text?: string }
    return block.type === 'text' ? block.text ?? '' : `[${block.type ?? 'block'}]`
  }).join('')
}

export function QueueDock(): JSX.Element | null {
  const { useConversation, updateQueue } = useRuntime()
  const inbox = useConversation(s => s.queue)
  // context 放置项不进 dock(对齐官方;消费后由会话流的 context 节点呈现)。
  const queue = inbox.filter(msg => msg.placement !== 'context')
  const lastAgentError = useConversation(s => s.lastAgentError)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const hasQueue = queue.length > 0
  if (!hasQueue && lastAgentError === null) return null

  const startEdit = (msgId: unknown, content: unknown): void => {
    setEditingId(String(msgId))
    setDraft(textOf(content))
  }

  const commitEdit = async (msgId: string): Promise<void> => {
    const text = draft.trim()
    if (text === '' || editBusy) return
    setEditBusy(true)
    // 官方 updateQueue edit:以完整 prompt content 块数组替换排队内容。
    await updateQueue(msgId, { kind: 'edit', content: [{ type: 'text', text }] })
    setEditBusy(false)
    setEditingId(null)
  }

  return (
    <div className="queue-dock">
      {lastAgentError !== null && (
        <div className="queue-feedback queue-feedback--error" data-kind="agent-error">
          <StatusIcon kind="err" className="queue-feedback-icon" />
          <span className="queue-feedback-label">Agent 反馈</span>
          <span className="queue-feedback-text">{lastAgentError}</span>
        </div>
      )}
      {hasQueue && (
        <div className="queue-list" data-count={queue.length}>
          {queue.map(msg => (
            <div className="queue-row" key={msg.id} data-placement={msg.placement}>
              <span className="queue-placement"><StatusIcon kind="wait" className="queue-placement-icon" />{PLACEMENT_LABELS[msg.placement] ?? msg.placement}</span>
              {editingId === String(msg.id) ? (
                <span className="queue-edit">
                  <input
                    className="queue-edit-input"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void commitEdit(String(msg.id)) }
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    aria-label="排队内容"
                  />
                  <button type="button" className="queue-action" disabled={editBusy || draft.trim() === ''} onClick={() => void commitEdit(String(msg.id))}>保存</button>
                  <button type="button" className="queue-action" disabled={editBusy} onClick={() => setEditingId(null)}>取消</button>
                </span>
              ) : (
                <span className="queue-preview">{msg.preview || textOf(msg.content) || '(empty)'}</span>
              )}
              {msg.placement === 'queued' && (
                <span className="queue-actions">
                  {editingId === String(msg.id) ? null : (
                    <>
                      <button
                        type="button" className="queue-action" title="行内编辑排队内容"
                        onClick={() => startEdit(msg.id, msg.content)}
                      >编辑</button>
                      <button
                        type="button" className="queue-action" title="提升为插队(steer)"
                        onClick={() => void updateQueue(String(msg.id), { kind: 'steer' })}
                      >插队</button>
                      <button
                        type="button" className="queue-action" title="移除排队"
                        onClick={() => void updateQueue(String(msg.id), { kind: 'remove' })}
                      >移除</button>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
