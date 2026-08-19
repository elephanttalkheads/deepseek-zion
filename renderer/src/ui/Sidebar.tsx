/**
 * Sidebar — session list (M1 + P2)。渲染 SessionListSnapshot:
 * - 搜索过滤 + 行选中高亮 + 运行/完成态。
 * - 视图选项菜单(分组方式:按工作区/单列表;排序方式:手动/最近更新),手写对齐
 *   官方 ui-workspace ViewOptionsMenu(groupBy/orderBy 两轴;按工作区分组用
 *   WorkspaceView.sessionIds 账目,无归属行落入「未分组」)。
 * - 会话行 … 菜单(重命名/分叉会话/归档会话):rename 走 Modal + session.rename;
 *   fork 走 session.fork(省略 atSeq = 最后完成的回合)并选中子会话;archive 走
 *   workspace.archiveSession(无确认弹窗,官方同)。
 * - 拖拽重排(官方 ui-workspace DragState 等位,仅按工作区分组模式):
 *   会话行拖到组内目标行上/下半 → workspace.insertSessionBefore;工作区组头
 *   拖拽 → workspace.insertBefore;原生拖拽期间文档级 accept(dragover/drop)。
 * - 溢出展开(官方 COLLAPSED_SESSION_LIMIT=5):组内折叠显示 5 行 + 「+N」展开。
 * 页脚:设置齿轮(打开 SettingsShell)。
 */
import { useEffect, useMemo, useState } from 'react'
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
/** 官方 ui-workspace COLLAPSED_SESSION_LIMIT:组内折叠行数。 */
const COLLAPSED_SESSION_LIMIT = 5

/** 在飞拖拽(官方 DragState 等位)。 */
type DragState =
  | { kind: 'session'; accountKey: string; sessionId: string }
  | { kind: 'workspace'; workspaceId: string }
  | null

interface GroupView {
  key: string
  title: string
  entries: SessionListEntry[]
  isWorkspace: boolean
}

export function Sidebar({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }): JSX.Element {
  const { useSessions, selectSession, selectedSessionId, createSession, workspaces, sessionRowActions, workspaceActions } = useRuntime()
  const items = useSessions(s => s.items)
  const listState = useSessions(s => s.state)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState<ViewOptions>({ groupBy: 'flat', orderBy: 'updated' })
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ sessionId: string; title: string } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [dropMarker, setDropMarker] = useState<{ id: string; half: 'before' | 'after' } | null>(null)

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
    const result: GroupView[] = []
    for (const ws of workspaces) {
      const ids = new Set(ws.sessionIds)
      const members = rows.filter(entry => ids.has(entry.sessionId))
      if (members.length === 0) continue
      for (const m of members) used.add(m.sessionId)
      // 手动排序 → 跟随工作区账目顺序(拖拽重排的落点可见);否则按 rows(updatedAt) 序。
      const ordered = view.orderBy === 'manual'
        ? ws.sessionIds
          .map(id => members.find(m => m.sessionId === id))
          .filter((e): e is SessionListEntry => e !== undefined)
        : members
      result.push({ key: ws.workspaceId, title: ws.title, entries: ordered, isWorkspace: true })
    }
    const ungrouped = rows.filter(entry => !used.has(entry.sessionId))
    if (ungrouped.length > 0) result.push({ key: UNGROUPED_KEY, title: '未分组', entries: ungrouped, isWorkspace: false })
    return result
  }, [rows, workspaces, view.groupBy, view.orderBy])

  // 原生拖拽期间文档级 accept:在列表外释放不算拒绝(官方 useNativeDragAcceptance)。
  useEffect(() => {
    if (drag === null) return
    const acceptDrag = (event: DragEvent): void => {
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
    }
    const acceptDrop = (event: DragEvent): void => { event.preventDefault() }
    document.addEventListener('dragover', acceptDrag)
    document.addEventListener('drop', acceptDrop)
    return () => {
      document.removeEventListener('dragover', acceptDrag)
      document.removeEventListener('drop', acceptDrop)
    }
  }, [drag])

  const runRowAction = (fn: () => Promise<boolean>, failure: string): void => {
    setRowError(null)
    void fn().then(ok => { if (!ok) setRowError(failure) })
  }

  /** 会话行放下:目标行上半=插到其前,下半=插到其后(anchor=下一兄弟)。 */
  const commitSessionDrop = (event: React.DragEvent, groupKey: string, overId: string): void => {
    if (drag?.kind !== 'session' || drag.accountKey !== groupKey || drag.sessionId === overId) return
    const group = groups?.find(g => g.key === groupKey)
    if (group === undefined || !group.isWorkspace) return
    const rect = event.currentTarget.getBoundingClientRect()
    const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    const index = group.entries.findIndex(e => e.sessionId === overId)
    const anchor = half === 'before' ? overId : group.entries[index + 1]?.sessionId
    setDropMarker(null)
    setDrag(null)
    runRowAction(() => workspaceActions.insertSessionBefore(groupKey as import('../../vendor/client-connection/client/api.ts').WorkspaceId, drag.sessionId, anchor), '拖拽重排失败')
  }

  /** 工作区组头放下:上半=插到该组前,下半=插到其后。 */
  const commitWorkspaceDrop = (event: React.DragEvent, overKey: string): void => {
    if (drag?.kind !== 'workspace' || drag.workspaceId === overKey) return
    if (groups === null) return
    const index = groups.findIndex(g => g.key === overKey)
    if (index === -1) return
    const rect = event.currentTarget.getBoundingClientRect()
    const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    const anchor = half === 'before'
      ? overKey
      : (() => {
        const next = groups[index + 1]
        return next !== undefined && next.isWorkspace ? next.key : undefined
      })()
    setDropMarker(null)
    setDrag(null)
    runRowAction(() => workspaceActions.insertBefore(
      drag.workspaceId as import('../../vendor/client-connection/client/api.ts').WorkspaceId,
      anchor as import('../../vendor/client-connection/client/api.ts').WorkspaceId | undefined,
    ), '工作区重排失败')
  }

  const renderEntry = (entry: SessionListEntry, now: number, groupKey: string | undefined) => {
    const id = entry.sessionId
    const isSelected = selectedSessionId === id
    const isOpen = expanded[id] ?? false
    const hasChildren = items.some(child => child.parentSessionId === entry.sessionId)
    const title = entry.title ?? basename(entry.cwd) ?? 'Untitled session'
    // 拖拽仅限按工作区分组内的账目行(官方:workspace-group sessions outside search)。
    const draggable = groupKey !== undefined && groupKey !== UNGROUPED_KEY && drag?.kind !== 'workspace'
    const marker = dropMarker !== null && dropMarker.id === id ? dropMarker.half : undefined
    return (
      <div
        key={id}
        className="sidebar-item"
        data-selected={isSelected || undefined}
        data-running={entry.running || undefined}
        data-blank={entry.blank || undefined}
        data-drop-before={marker === 'before' || undefined}
        data-drop-after={marker === 'after' || undefined}
        draggable={draggable}
        onDragStart={(e) => {
          if (groupKey === undefined) return
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', id)
          setDrag({ kind: 'session', accountKey: groupKey, sessionId: id })
        }}
        onDragEnd={() => { setDrag(null); setDropMarker(null) }}
        onDragOver={(e) => {
          if (drag?.kind !== 'session' || drag.accountKey !== groupKey || drag.sessionId === id) return
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const half = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
          setDropMarker({ id, half })
        }}
        onDragLeave={() => { setDropMarker(prev => (prev?.id === id ? null : prev)) }}
        onDrop={(e) => { commitSessionDrop(e, groupKey ?? '', id) }}
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
          rows.map(entry => renderEntry(entry, now, undefined))
        ) : (
          groups.map(group => {
            const collapsed = !expandedGroups[group.key] && group.entries.length > COLLAPSED_SESSION_LIMIT
            const visible = collapsed ? group.entries.slice(0, COLLAPSED_SESSION_LIMIT) : group.entries
            const marker = dropMarker !== null && dropMarker.id === group.key ? dropMarker.half : undefined
            return (
              <div key={group.key} className="sidebar-group" data-group={group.key}>
                <div
                  className="sidebar-group-header"
                  data-drop-before={marker === 'before' || undefined}
                  data-drop-after={marker === 'after' || undefined}
                  draggable={group.isWorkspace && drag?.kind !== 'session'}
                  onDragStart={(e) => {
                    if (!group.isWorkspace) return
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', group.key)
                    setDrag({ kind: 'workspace', workspaceId: group.key })
                  }}
                  onDragEnd={() => { setDrag(null); setDropMarker(null) }}
                  onDragOver={(e) => {
                    if (drag?.kind !== 'workspace' || drag.workspaceId === group.key) return
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    const half = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                    setDropMarker({ id: group.key, half })
                  }}
                  onDragLeave={() => { setDropMarker(prev => (prev?.id === group.key ? null : prev)) }}
                  onDrop={(e) => { commitWorkspaceDrop(e, group.key) }}
                >
                  {group.title}
                </div>
                {visible.map(entry => renderEntry(entry, now, group.key))}
                {collapsed && (
                  <button
                    type="button"
                    className="sidebar-group-more"
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [group.key]: true }))}
                  >
                    {group.entries.length - COLLAPSED_SESSION_LIMIT} 个更多…
                  </button>
                )}
              </div>
            )
          })
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
