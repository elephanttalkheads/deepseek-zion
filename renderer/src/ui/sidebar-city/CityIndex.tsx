/**
 * CityIndex — 全部工作区与会话的覆盖索引(DVD 菜单屏,决策记录:拆分 #5)。
 * 承载从旧列表迁入的全部行级入口:⋯ 菜单(重命名/分叉/归档,vendor Menu + Modal)、
 * caret 子会话展开(真实 fork lineage)、会话行拖拽(insertSessionBefore)、
 * 工作区头拖拽(insertBefore)、「+N 个更多…」(COLLAPSED=5)。
 * 2026-08-28 demo 迭代形态:无 stylebar;点会话只选中不跳相机(索引保持打开);
 * 底部 LOCATE 按钮显式把相机切到所选会话位置并关闭索引。
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '../../app/runtime.tsx'
import { Menu } from '../../../vendor/ui-primitives/Menu.tsx'
import { Modal } from '../../../vendor/ui-primitives/Modal.tsx'
import {
  IconArchiveOutline20, IconBranchOutline16, IconEditOutline16, IconEllipsisOutline16,
} from '../../../vendor/ui-primitives/icons/index.tsx'
import { CITY_STATUS, MATRIX_GLYPHS, type CitySession, type CityWorkspace } from './city-engine.ts'

const COLLAPSED_SESSION_LIMIT = 5

type DragState =
  | { kind: 'session'; wsId: string; sessionId: string }
  | { kind: 'workspace'; workspaceId: string }
  | null

interface CityIndexProps {
  model: CityWorkspace[]
  open: boolean
  flat: boolean
  orderBy: 'updated' | 'manual'
  selectedSessionId: string | null
  reduced: boolean
  onSelectSession: (id: string) => void
  /** LOCATE / 章标题:跳相机到指定工作区并关闭索引。 */
  onLocateWorkspace: (workspaceId: string) => void
  selectedWorkspaceId: string | null
}

export function CityIndex({
  model, open, flat, orderBy, selectedSessionId, selectedWorkspaceId, reduced,
  onSelectSession, onLocateWorkspace,
}: CityIndexProps): JSX.Element {
  const { selectSession, sessionRowActions, workspaceActions } = useRuntime()
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [collapsedCarets, setCollapsedCarets] = useState<Record<string, boolean>>({})
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ sessionId: string; title: string } | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const [drag, setDrag] = useState<DragState>(null)
  const [dropMarker, setDropMarker] = useState<{ id: string; half: 'before' | 'after' } | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  // 打开时焦点落到当前会话行(对齐源原型焦点管理)。
  useEffect(() => {
    if (!open) return
    const current = bodyRef.current?.querySelector<HTMLElement>('.map-session-button.is-current')
    if (current != null) {
      current.scrollIntoView({ block: 'center' })
      current.focus({ preventScroll: true })
    }
  }, [open])

  // 原生拖拽期间文档级 accept(官方 useNativeDragAcceptance 等位)。
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

  const commitSessionDrop = (event: React.DragEvent, ws: CityWorkspace, overId: string): void => {
    if (drag?.kind !== 'session' || drag.wsId !== ws.id || drag.sessionId === overId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    const index = ws.sessions.findIndex(s => s.id === overId)
    const anchor = half === 'before' ? overId : ws.sessions[index + 1]?.id
    setDropMarker(null)
    setDrag(null)
    runRowAction(
      () => workspaceActions.insertSessionBefore(ws.id as import('../../../vendor/client-connection/client/api.ts').WorkspaceId, drag.sessionId, anchor),
      '拖拽重排失败',
    )
  }

  const commitWorkspaceDrop = (event: React.DragEvent, overId: string): void => {
    if (drag?.kind !== 'workspace' || drag.workspaceId === overId) return
    const index = model.findIndex(w => w.id === overId)
    if (index === -1) return
    const rect = event.currentTarget.getBoundingClientRect()
    const half = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    const anchor = half === 'before' ? overId : model[index + 1]?.id
    setDropMarker(null)
    setDrag(null)
    runRowAction(
      () => workspaceActions.insertBefore(
        drag.workspaceId as import('../../../vendor/client-connection/client/api.ts').WorkspaceId,
        anchor as import('../../../vendor/client-connection/client/api.ts').WorkspaceId | undefined,
      ),
      '工作区重排失败',
    )
  }

  const renderRow = (ws: CityWorkspace, session: CitySession, opts: { isChild?: boolean; flatIndex?: number } = {}) => {
    const isCurrent = selectedSessionId === session.id
    const draggable = !flat && !opts.isChild && drag?.kind !== 'workspace'
    const marker = dropMarker !== null && dropMarker.id === session.id ? dropMarker.half : undefined
    const hasChildren = (session.children?.length ?? 0) > 0
    const caretCollapsed = collapsedCarets[session.id] === true
    return (
      <li role="none" key={session.id}>
        <div
          className={`map-row${opts.isChild === true ? ' is-child' : ''}`}
          data-session-id={session.id}
          data-drop-before={marker === 'before' || undefined}
          data-drop-after={marker === 'after' || undefined}
          draggable={draggable}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', session.id)
            setDrag({ kind: 'session', wsId: ws.id, sessionId: session.id })
          }}
          onDragEnd={() => { setDrag(null); setDropMarker(null) }}
          onDragOver={(e) => {
            if (drag?.kind !== 'session' || drag.wsId !== ws.id || drag.sessionId === session.id) return
            e.preventDefault()
            const rect = e.currentTarget.getBoundingClientRect()
            setDropMarker({ id: session.id, half: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
          }}
          onDragLeave={() => { setDropMarker(prev => (prev?.id === session.id ? null : prev)) }}
          onDrop={(e) => { commitSessionDrop(e, ws, session.id) }}
        >
          <button
            type="button"
            className={`map-session-button${isCurrent ? ' is-current' : ''}`}
            role="treeitem"
            aria-current={isCurrent ? 'page' : undefined}
            style={{ '--status-color': CITY_STATUS[session.status].color } as React.CSSProperties}
            aria-label={`${ws.name},${session.title},${CITY_STATUS[session.status].label},${session.time}`}
            title={`${session.title} · ${CITY_STATUS[session.status].label} · ${session.time}`}
            onClick={() => {
              selectSession(session.id as import('../../../vendor/client-connection/client/api.ts').SessionId)
              onSelectSession(session.id)
            }}
          >
            {flat && <span className="idx">{String(opts.flatIndex ?? 0).padStart(2, '0')}</span>}
            <span className="cur">&gt;</span>
            <span className="title">{session.title}</span>
            <span className="age">{session.time}</span>
          </button>
          {!flat && hasChildren && (
            <button
              type="button"
              className="map-caret"
              aria-label={caretCollapsed ? '展开子会话' : '收起子会话'}
              aria-expanded={!caretCollapsed}
              onClick={(e) => {
                e.stopPropagation()
                setCollapsedCarets(prev => ({ ...prev, [session.id]: !caretCollapsed }))
              }}
            >
              {caretCollapsed ? '▸' : '▾'}
            </button>
          )}
          <Menu
            open={menuFor === session.id}
            onClose={() => setMenuFor(null)}
            items={[
              { id: 'rename', label: '重命名', icon: <IconEditOutline16 /> },
              { id: 'fork', label: '分叉会话', icon: <IconBranchOutline16 /> },
              { id: 'archive', label: '归档会话', icon: <IconArchiveOutline20 size={16} /> },
            ]}
            onSelect={(itemId) => {
              setMenuFor(null)
              if (itemId === 'rename') setRenaming({ sessionId: session.id, title: session.title })
              else if (itemId === 'fork') runRowAction(() => sessionRowActions.fork(session.id), '分叉失败(最后回合未完成或无权限)')
              else if (itemId === 'archive') runRowAction(() => sessionRowActions.archive(session.id), '归档失败')
            }}
            align="end"
            dense
            portal
            anchor={(
              <button
                type="button"
                className="map-row-menu"
                aria-label={`会话“${session.title}”的操作`}
                aria-haspopup="menu"
                aria-expanded={menuFor === session.id}
                onClick={(e) => { e.stopPropagation(); setMenuFor(v => (v === session.id ? null : session.id)) }}
              >
                <IconEllipsisOutline16 />
              </button>
            )}
          />
        </div>
        {!flat && hasChildren && !caretCollapsed && session.children!.map(child => (
          <NestedRow key={child.id} ws={ws} session={child} renderRow={renderRow} />
        ))}
      </li>
    )
  }

  // 平铺:全工作区合并(updated 按时间,manual 按工作区+数组序),全局序号。
  const flatRows = flat
    ? model.flatMap(ws => ws.sessions.map(session => ({ ws, session })))
        .sort((a, b) => (orderBy === 'updated' ? b.session.updatedAt - a.session.updatedAt : 0))
    : []

  const selectedSession = selectedSessionId != null
    ? model.flatMap(ws => ws.sessions.flatMap(s => [s, ...(s.children ?? [])])).find(s => s.id === selectedSessionId)
    : undefined

  let flatIndex = 0

  return (
    <section className={`city-map${open ? ' is-open' : ''}`} id="city-map" aria-hidden={!open} aria-label="全部工作区与会话索引">
      <MapRain open={open} reduced={reduced} />
      <div className={`map-body${flat ? ' flat' : ' grouped'}`} ref={bodyRef} role="tree">
        {flat ? (
          <ul className="map-session-list" role="group">
            {flatRows.map(({ ws, session }) => {
              flatIndex += 1
              return renderRow(ws, session, { flatIndex })
            })}
          </ul>
        ) : (
          model.map((ws) => {
            const collapsed = expandedGroups[ws.id] !== true && ws.sessions.length > COLLAPSED_SESSION_LIMIT
            const visible = collapsed ? ws.sessions.slice(0, COLLAPSED_SESSION_LIMIT) : ws.sessions
            const marker = dropMarker !== null && dropMarker.id === ws.id ? dropMarker.half : undefined
            return (
              <div key={ws.id}>
                <button
                  type="button"
                  className="map-district-head"
                  data-drop-before={marker === 'before' || undefined}
                  data-drop-after={marker === 'after' || undefined}
                  aria-label={`前往工作区 ${ws.name},${ws.sessions.length} 个会话`}
                  draggable={drag?.kind !== 'session'}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', ws.id)
                    setDrag({ kind: 'workspace', workspaceId: ws.id })
                  }}
                  onDragEnd={() => { setDrag(null); setDropMarker(null) }}
                  onDragOver={(e) => {
                    if (drag?.kind !== 'workspace' || drag.workspaceId === ws.id) return
                    e.preventDefault()
                    const rect = e.currentTarget.getBoundingClientRect()
                    setDropMarker({ id: ws.id, half: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
                  }}
                  onDragLeave={() => { setDropMarker(prev => (prev?.id === ws.id ? null : prev)) }}
                  onDrop={(e) => { commitWorkspaceDrop(e, ws.id) }}
                  onClick={() => onLocateWorkspace(ws.id)}
                >
                  {ws.name}
                </button>
                <ul className="map-session-list" role="group" aria-label={ws.name}>
                  {visible.map(session => renderRow(ws, session))}
                </ul>
                {collapsed && (
                  <button
                    type="button"
                    className="map-more-row"
                    aria-label={`展开 ${ws.name} 折叠的 ${ws.sessions.length - COLLAPSED_SESSION_LIMIT} 个会话`}
                    onClick={() => setExpandedGroups(prev => ({ ...prev, [ws.id]: true }))}
                  >
                    {`+${ws.sessions.length - COLLAPSED_SESSION_LIMIT} 个更多…`}
                  </button>
                )}
              </div>
            )
          })
        )}
        {model.length === 0 && <div className="map-empty">没有可显示的会话</div>}
        {rowError !== null && <div className="map-row-error" role="alert">{rowError}</div>}
      </div>
      <div className="map-foot">
        <button
          className="map-locate"
          type="button"
          aria-label="前往所选会话的城市位置"
          disabled={selectedWorkspaceId === null}
          onClick={() => { if (selectedWorkspaceId !== null) onLocateWorkspace(selectedWorkspaceId) }}
        >
          <span className="k">LOCATE ▸</span><span className="t">{selectedSession?.title ?? ''}</span>
        </button>
      </div>
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
    </section>
  )
}

/** 子会话行(caret 展开;真实 fork lineage,不再嵌套更深)。 */
function NestedRow({ ws, session, renderRow }: {
  ws: CityWorkspace
  session: CitySession
  renderRow: (ws: CityWorkspace, session: CitySession, opts: { isChild?: boolean }) => JSX.Element
}): JSX.Element {
  return renderRow(ws, session, { isChild: true })
}

/** city-map 数字雨背景(打开才启动 rAF;reduced 画一帧静态雨幕)。 */
function MapRain({ open, reduced }: { open: boolean; reduced: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas === null || ctx == null || !open) return
    const FS = 14
    let cols: { x: number; y: number; spd: number }[] = []
    let raf = 0
    let last = 0

    const put = (ch: string, x: number, y: number): void => {
      ctx.save()
      ctx.translate(x + FS / 2, y)
      ctx.scale(0.55, 1)
      ctx.fillText(ch, 0, 0)
      ctx.restore()
    }
    const resize = (): void => {
      canvas.width = Math.max(1, canvas.clientWidth)
      canvas.height = Math.max(1, canvas.clientHeight)
      ctx.font = `${FS}px "Matrix Code"`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      cols = Array.from({ length: Math.ceil(canvas.width / (FS * 0.62)) }, (_, i) => ({
        x: i * FS * 0.62,
        y: Math.random() * -80 * FS,
        spd: 0.55 + Math.random() * 0.5,
      }))
      ctx.fillStyle = '#010402'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    const tick = (ts: number): void => {
      raf = requestAnimationFrame(tick)
      if (ts - last < 95) return
      last = ts
      ctx.fillStyle = 'rgba(1,4,2,0.09)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      for (const c of cols) {
        const ch = MATRIX_GLYPHS[(Math.random() * MATRIX_GLYPHS.length) | 0]
        if (Math.random() < 0.1) {
          ctx.shadowColor = 'rgba(120,220,150,0.8)'
          ctx.shadowBlur = 6
          ctx.fillStyle = '#bfeed0'
        } else {
          ctx.shadowBlur = 0
          ctx.fillStyle = '#4e9e57'
        }
        put(ch, c.x, c.y)
        ctx.shadowBlur = 0
        c.y += FS * c.spd
        if (c.y > canvas.height && Math.random() > 0.955) c.y = Math.random() * -30 * FS
      }
    }

    resize()
    const observer = new ResizeObserver(() => { if (open) resize() })
    observer.observe(canvas)
    if (reduced) {
      ctx.fillStyle = 'rgba(78,158,87,0.6)'
      for (const c of cols) {
        for (let y = (c.x * 13) % 28; y < canvas.height; y += 28) {
          put(MATRIX_GLYPHS[(Math.random() * MATRIX_GLYPHS.length) | 0], c.x, y)
        }
      }
    } else {
      raf = requestAnimationFrame(tick)
    }
    return () => { cancelAnimationFrame(raf); observer.disconnect() }
  }, [open, reduced])

  return <canvas className="map-rain" ref={canvasRef} aria-hidden="true" />
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
