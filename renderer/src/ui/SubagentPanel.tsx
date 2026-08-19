/**
 * SubagentPanel — right-column subagent tree (functional wiring, M2). Shows the
 * selected session's direct-child catalog (subagents.list via the manager's
 * refreshSubagents → SessionListSnapshot.subagentsByParent): label/activity per
 * child, a refresh button, and prompt / interrupt verbs for continuable childs.
 */
import { useEffect, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import type { SubagentCatalogSnapshot } from '../../vendor/client-runtime/client/sessions/manager.ts'

const ACTIVITY_LABEL: Record<string, string> = { running: '运行中', inactive: '空闲' }

export function SubagentPanel(): JSX.Element {
  const { useSessions, subagentActions, selectedSessionId } = useRuntime()
  const subagentsByParent = useSessions(s => s.subagentsByParent)
  const [promptTexts, setPromptTexts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const catalog: SubagentCatalogSnapshot | undefined = selectedSessionId === undefined
    ? undefined
    : subagentsByParent[selectedSessionId]

  // Refresh the selected session's catalog whenever the selection changes.
  useEffect(() => {
    if (selectedSessionId === undefined) return
    void subagentActions.refresh()
  }, [selectedSessionId, subagentActions])

  const sendPrompt = async (childId: string, label: string): Promise<void> => {
    const text = (promptTexts[childId] ?? '').trim()
    if (text === '' || busy || selectedSessionId === undefined) return
    setBusy(true)
    setNotice(null)
    const ok = await subagentActions.prompt({ parentSessionId: selectedSessionId, childSessionId: childId }, text)
    setBusy(false)
    if (ok) {
      setPromptTexts(prev => ({ ...prev, [childId]: '' }))
      setNotice(`已投递给 ${label}`)
    } else {
      setNotice('投递失败')
    }
  }

  const interrupt = async (childId: string, label: string): Promise<void> => {
    if (busy || selectedSessionId === undefined) return
    setBusy(true)
    setNotice(null)
    const ok = await subagentActions.interrupt({ parentSessionId: selectedSessionId, childSessionId: childId, mode: 'continuable' })
    setBusy(false)
    setNotice(ok ? `已中断 ${label}` : '中断失败')
  }

  const entries = catalog?.entries ?? []

  return (
    <div className="subagent-panel">
      <div className="subagent-panel-head">
        <span className="subagent-panel-title">子代理</span>
        <button
          type="button"
          className="subagent-panel-refresh"
          disabled={selectedSessionId === undefined || catalog?.state === 'loading'}
          onClick={() => void subagentActions.refresh()}
        >
          {catalog?.state === 'loading' ? '…' : '刷新'}
        </button>
      </div>
      {selectedSessionId === undefined && <div className="subagent-panel-muted">选择会话后查看其子代理</div>}
      {selectedSessionId !== undefined && catalog?.state === 'loading' && <div className="subagent-panel-muted">加载中…</div>}
      {selectedSessionId !== undefined && catalog?.state === 'error' && <div className="subagent-panel-muted subagent-panel-error">加载失败</div>}
      {selectedSessionId !== undefined && catalog !== undefined && catalog.state === 'ready' && entries.length === 0 && (
        <div className="subagent-panel-muted">无子代理</div>
      )}
      {entries.length > 0 && (
        <div className="subagent-panel-list">
          {entries.map(entry => {
            if (entry.kind === 'diagnostic') {
              return (
                <div key={entry.id} className="subagent-panel-row" data-diagnostic>
                  <span className="subagent-panel-label">{entry.id.slice(0, 8)}…</span>
                  <span className="subagent-panel-badge">异常（{entry.reason}）</span>
                </div>
              )
            }
            const label = entry.label ?? 'one-shot'
            const childId = entry.id
            return (
              <div key={childId} className="subagent-panel-row" data-activity={entry.activity}>
                <span className="subagent-panel-label" title={childId}>{label}</span>
                <span className="subagent-panel-badge" data-activity={entry.activity}>{ACTIVITY_LABEL[entry.activity] ?? entry.activity}</span>
                {entry.hasChildren && <span className="subagent-panel-badge">有子级</span>}
                {entry.mode === 'continuable' && (
                  <span className="subagent-panel-verbs">
                    <input
                      className="subagent-panel-prompt"
                      placeholder="投递消息…"
                      value={promptTexts[childId] ?? ''}
                      onChange={(e) => setPromptTexts(prev => ({ ...prev, [childId]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void sendPrompt(childId, label) }
                      }}
                      aria-label={`投递消息给 ${label}`}
                    />
                    <button type="button" className="subagent-panel-btn" disabled={busy} onClick={() => void sendPrompt(childId, label)}>发</button>
                    <button type="button" className="subagent-panel-btn subagent-panel-btn-danger" disabled={busy} onClick={() => void interrupt(childId, label)}>中断</button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {notice !== null && <div className="subagent-panel-notice">{notice}</div>}
    </div>
  )
}
