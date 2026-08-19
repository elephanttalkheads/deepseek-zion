/**
 * Sidebar — session list (M1 + P2)。渲染 SessionListSnapshot:
 * - 搜索过滤 + 行选中高亮 + 运行/完成态。
 * - 视图选项菜单(分组方式:按工作区/单列表;排序方式:手动/最近更新),手写对齐
 *   官方 ui-workspace ViewOptionsMenu(groupBy/orderBy 两轴;按工作区分组用
 *   WorkspaceView.sessionIds 账目,无归属行落入「未分组」)。
 * - 会话行 … 菜单(重命名/分叉会话/归档会话):rename 走 Modal + session.rename;
 *   fork 走 session.fork(省略 atSeq = 最后完成的回合)并选中子会话;archive 走
 *   workspace.archiveSession(无确认弹窗,官方同)。
 * 页脚:设置齿轮(打开 SettingsShell)。
 */
import { useMemo, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { SettingsShell } from './SettingsShell.tsx'
import { Menu } from '../../vendor/ui-primitives/Menu.tsx'
import { Modal } from '../../vendor/ui-primitives/Modal.tsx'
import {
  IconArchiveOutline20, IconBranchOutline16, IconEditOutline16,
  IconEllipsisOutline16, IconPersonalizationOutline16,
} from '../../vendor/ui-primitives/icons/index.tsx'
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

/** 视图选项(官方 ViewOptionsMenu 两轴;本地状态,手写排序/分组投影)。 */
interface ViewOptions {
  groupBy: 'workspace' | 'flat'
  orderBy: 'updated' | 'manual'
}

const UNGROUPED_KEY = 'ungrouped'

export function Sidebar({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }): JSX.Element {
  const { useSessions, selectSession, selectedSessionId, createSession, workspaces, sessionRowActions } = useRuntime()
  const items = useSessions(s => s.items)
  const listState = useSessions(s => s.state)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<ViewOptions>({ groupBy: 'flat', orderBy: 'updated' })
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ sessionId: string; title: string } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const source = items
    const filtered = q === ''
      ? source.filter(entry => !entry.blank)
      : source.filter(entry =>
        !entry.blank &&
        ((entry.title ?? '').toLowerCase().includes(q) || entry.sessionId.toLowerCase().includes(q)),
      )
    if (view.orderBy === 'manual') return filtered
    return [...filtered].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [items, query, view.orderBy])

  // 按工作区分组:workspaces 的 sessionIds 账目 → 组;无归属 → 未分组。
  const groups = useMemo(() => {
    if (view.groupBy === 'flat') return null
    const used = new Set<string>()
    const result: { key: string; title: string; entries: SessionListEntry[] }[] = []
    for (const ws of workspaces) {
      const ids = new Set(ws.sessionIds)
      const members = rows.filter(entry => ids.has(entry.sessionId))
      if (members.length === 0) continue
      for (const m of members) used.add(m.sessionId)
      result.push({ key: ws.workspaceId, title: ws.title, entries: members })
    }
    const ungrouped = rows.filter(entry => !used.has(entry.sessionId))
    if (ungrouped.length > 0) result.push({ key: UNGROUPED_KEY, title: '未分组', entries: ungrouped })
    return result
  }, [rows, workspaces, view.groupBy])

  const runRowAction = (fn: () => Promise<boolean>, failure: string): void => {
    setRowError(null)
    void fn().then(ok => { if (!ok) setRowError(failure) })
  }

  const renderEntry = (entry: SessionListEntry, now: number) => {
    const id = entry.sessionId
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
          <span className="sidebar-row-time">{relativeTime(entry.updatedAt, now)}</span>
        </button>
        <Menu
          open={menuFor === id}
          onClose={() => setMenuFor(null)}
          items={[
            { id: 'rename', label: '重命名', icon: <IconEditOutline16 /> },
            { id: 'fork', label: '分叉会话', icon: <IconBranchOutline16 /> },
            { id: 'archive', label: '归档会话', icon: <IconArchiveOutline20 size={16} /> },
          ]}
          onSelect={(itemId) => {
            setMenuFor(null)
            if (itemId === 'rename') setRenaming({ sessionId: id, title })
            else if (itemId === 'fork') runRowAction(() => sessionRowActions.fork(id), '分叉失败(最后回合未完成或无权限)')
            else if (itemId === 'archive') runRowAction(() => sessionRowActions.archive(id), '归档失败')
          }}
          align="end"
          dense
          portal
          anchor={(
            <button
              type="button"
              className="sidebar-row-menu"
              aria-label="会话操作"
              aria-haspopup="menu"
              aria-expanded={menuFor === id}
              onClick={(e) => { e.stopPropagation(); setMenuFor(v => (v === id ? null : id)) }}
            >
              <IconEllipsisOutline16 />
            </button>
          )}
        />
      </div>
    )
  }

  const now = Date.now()

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
        <button
          type="button"
          className="sidebar-view-options"
          title="视图选项"
          aria-label="视图选项"
          aria-haspopup="menu"
          aria-expanded={viewMenuOpen}
          onClick={() => setViewMenuOpen(v => !v)}
        >
          <IconPersonalizationOutline16 />
        </button>
        <Menu
          open={viewMenuOpen}
          onClose={() => setViewMenuOpen(false)}
          items={[
            { type: 'label' as const, id: 'group-by', text: '分组方式' },
            { id: 'workspace', label: '按工作区' },
            { id: 'flat', label: '单列表' },
            { type: 'separator' as const, id: 'order-by-separator' },
            { type: 'label' as const, id: 'order-by', text: '排序方式' },
            { id: 'manual', label: '手动排序' },
            { id: 'updated', label: '最近更新' },
          ]}
          selectedIds={[view.groupBy, view.orderBy]}
          onSelect={(id) => {
            if (id === 'workspace' || id === 'flat') setView(prev => ({ ...prev, groupBy: id }))
            else if (id === 'manual' || id === 'updated') setView(prev => ({ ...prev, orderBy: id }))
            setViewMenuOpen(false)
          }}
          align="end"
          dense
          portal
          anchor={<span aria-hidden />}
        />
        <button className="sidebar-new" type="button" title="New session" onClick={() => void createSession()}>
          +
        </button>
      </div>
      <nav className="sidebar-list" aria-label="Sessions">
        {listState === 'loading' && <div className="sidebar-hint">Loading sessions…</div>}
        {listState === 'error' && (
          <div className="sidebar-hint sidebar-error">Failed to load sessions.</div>
        )}
        {groups === null ? (
          rows.map(entry => renderEntry(entry, now))
        ) : (
          groups.map(group => (
            <div key={group.key} className="sidebar-group" data-group={group.key}>
              <div className="sidebar-group-header">{group.title}</div>
              {group.entries.map(entry => renderEntry(entry, now))}
            </div>
          ))
        )}
        {rows.length === 0 && listState !== 'loading' && listState !== 'error' && (
          <div className="sidebar-hint">No sessions.</div>
        )}
        {rowError !== null && <div className="sidebar-row-error" role="alert">{rowError}</div>}
      </nav>
      <div className="sidebar-footer">
        <SlotAnchor slot="sidebar.footer.action" ownerProps={{}} />
        <button
          className="sidebar-settings-trigger"
          type="button"
          data-open={settingsOpen || undefined}
          onClick={() => setSettingsOpen(o => !o)}
          title="设置"
          aria-label="设置"
        >
          ⚙
        </button>
      </div>
      <SettingsShell open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {renaming !== null && (
        <RenameSessionModal
          sessionId={renaming.sessionId}
          initial={renaming.title}
          onCancel={() => setRenaming(null)}
          onSaved={(ok) => {
            setRenaming(null)
            if (!ok) setRowError('重命名失败')
          }}
        />
      )}
    </div>
  )
}

/** 会话重命名 Modal(官方 rename 装配的等位:Modal + 输入 + 保存)。 */
function RenameSessionModal({ sessionId, initial, onCancel, onSaved }: {
  sessionId: string
  initial: string
  onCancel: () => void
  onSaved: (ok: boolean) => void
}): JSX.Element {
  const { sessionRowActions } = useRuntime()
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)

  const save = async (): Promise<void> => {
    const title = text.trim()
    if (title === '' || busy) return
    setBusy(true)
    const ok = await sessionRowActions.rename(sessionId, title)
    setBusy(false)
    onSaved(ok)
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title="重命名会话"
      footer={(
        <>
          <button type="button" className="sidebar-modal-btn" onClick={onCancel}>取消</button>
          <button type="button" className="sidebar-modal-btn sidebar-modal-btn-primary" disabled={busy || text.trim() === ''} onClick={() => void save()}>
            {busy ? '…' : '保存'}
          </button>
        </>
      )}
    >
      <input
        className="sidebar-modal-input"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void save() }
          if (e.key === 'Escape') onCancel()
        }}
        aria-label="会话名称"
      />
    </Modal>
  )
}
