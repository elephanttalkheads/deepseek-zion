/**
 * Sidebar — session list (M1). Renders the manager's SessionListSnapshot with
 * search filtering, per-row title/activity state, and selection highlight.
 * CRUD (create/rename/archive) over the wire awaits M2 wiring; M1 shows the
 * rows the fixture/host provides.
 */
import { useMemo, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import type { SessionListEntry } from '../../vendor/client-runtime/client/sessions/lineage.ts'

/** Relative time in the official style: 刚刚 / N分钟 / N小时 / DD/MM. */
function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时`
  const days = Math.floor(hours / 24)
  return `${days}天`
}

function basename(p: string | undefined): string {
  if (p === undefined || p === '') return ''
  const norm = p.replace(/\\/g, '/')
  return norm.split('/').filter(Boolean).pop() ?? p
}

function rowKey(entry: SessionListEntry) {
  return entry.sessionId
}

export function Sidebar({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }): JSX.Element {
  const { useSessions, selectSession, selectedSessionId } = useRuntime()
  const items = useSessions(s => s.items)
  const listState = useSessions(s => s.state)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = items
    if (q === '') return source.filter(entry => !entry.blank)
    return source.filter(entry =>
      !entry.blank &&
      ((entry.title ?? '').toLowerCase().includes(q) || entry.sessionId.toLowerCase().includes(q)),
    )
  }, [items, query])

  return (
    <div className="sidebar">
      <div className="sidebar-search">
        <input
          className="sidebar-search-input"
          type="search"
          placeholder="Search sessions…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="Search sessions"
        />
        <button className="sidebar-new" type="button" title="New session" onClick={() => { /* M2 */ }}>
          +
        </button>
      </div>
      <nav className="sidebar-list" aria-label="Sessions">
        {listState === 'loading' && <div className="sidebar-hint">Loading sessions…</div>}
        {listState === 'error' && (
          <div className="sidebar-hint sidebar-error">Failed to load sessions.</div>
        )}
        {rows.length === 0 && listState !== 'loading' && (
          <div className="sidebar-hint">No sessions.</div>
        )}
        {rows.map((entry) => {
          const id = rowKey(entry)
          const isSelected = selectedSessionId === id
          const isOpen = expanded[id] ?? false
          const hasChildren = items.some(child => child.parentSessionId === entry.sessionId)
          const title = entry.title ?? basename(entry.cwd) ?? 'Untitled session'
          return (
            <div
              key={id}
              className="sidebar-item"
              data-selected={isSelected || undefined}
              data-running={entry.running || undefined}
              data-blank={entry.blank || undefined}
              style={{ paddingLeft: (entry.depth ?? 0) * 14 + 10 }}
            >
              {hasChildren && (
                <button
                  className="sidebar-caret"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setExpanded(prev => ({ ...prev, [id]: !isOpen }))}
                >
                  {isOpen ? '▾' : '▸'}
                </button>
              )}
              <button
                className="sidebar-row"
                type="button"
                onClick={() => selectSession(id)}
              >
                <span className="sidebar-row-title">{title}</span>
                {entry.running && <span className="sidebar-row-running">进行中</span>}
                {!entry.running && entry.completed && <span className="sidebar-row-done" title="Finished running">✓</span>}
                <span className="sidebar-row-time">{relativeTime(entry.updatedAt, Date.now())}</span>
              </button>
            </div>
          )
        })}
      </nav>
    </div>
  )
}
