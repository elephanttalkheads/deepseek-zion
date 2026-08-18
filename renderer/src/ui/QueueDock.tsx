/**
 * M3/M5 — QueueDock (Q19A self-authored presentational layer).
 *
 * Renders the selected session's transient inbox snapshot (snapshot.queue):
 * queued / steering / context placements the host pushes during and across
 * turns, plus per-row queue mutations (remove / steer) for queued items.
 * Also surfaces the session feedback strip: lastAgentError.
 */
import { useRuntime } from '../app/runtime.tsx'

const PLACEMENT_LABELS: Record<string, string> = { queued: '待发送', steering: '插队', context: '上下文' }

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map((b) => {
    const block = b as { type?: string; text?: string }
    return block.type === 'text' ? block.text ?? '' : `[${block.type ?? 'block'}]`
  }).join('')
}

export function QueueDock(): JSX.Element | null {
  const { useConversation, updateQueue } = useRuntime()
  const queue = useConversation(s => s.queue)
  const lastAgentError = useConversation(s => s.lastAgentError)
  const hasQueue = queue.length > 0
  if (!hasQueue && lastAgentError === null) return null
  return (
    <div className="queue-dock">
      {lastAgentError !== null && (
        <div className="queue-feedback queue-feedback--error" data-kind="agent-error">
          <span className="queue-feedback-label">Agent 反馈</span>
          <span className="queue-feedback-text">{lastAgentError}</span>
        </div>
      )}
      {hasQueue && (
        <div className="queue-list" data-count={queue.length}>
          {queue.map(msg => (
            <div className="queue-row" key={msg.id} data-placement={msg.placement}>
              <span className="queue-placement">{PLACEMENT_LABELS[msg.placement] ?? msg.placement}</span>
              <span className="queue-preview">{msg.preview || textOf(msg.content) || '(empty)'}</span>
              {msg.placement === 'queued' && (
                <span className="queue-actions">
                  <button
                    type="button" className="queue-action" title="提升为插队(steer)"
                    onClick={() => void updateQueue(String(msg.id), { kind: 'steer' })}
                  >插队</button>
                  <button
                    type="button" className="queue-action" title="移除排队"
                    onClick={() => void updateQueue(String(msg.id), { kind: 'remove' })}
                  >移除</button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
