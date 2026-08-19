/**
 * WorkspaceMenu — top-bar workspace selector (functional wiring, M2). A
 * dropdown over the workspace.list rows with rename / delete, plus «新建工作区»
 * which opens the in-app Miller 目录浏览弹窗(ui-directory-picker-browse,官方
 * 「选择工作区目录」)并创建工作区(workspace.create)。Mirrors the official
 * top-bar workspace switch.
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import { WorkspaceDirectoryBrowser } from '../app/directory-browser.tsx'
import type { WorkspaceView } from '../../vendor/client-connection/client/api.ts'

interface WorkspaceMenuProps {
  current: WorkspaceView | undefined
  open: boolean
  onToggle: () => void
  onClose: () => void
}

export function WorkspaceMenu({ current, open, onToggle, onClose }: WorkspaceMenuProps): JSX.Element {
  const { workspaces, workspaceActions } = useRuntime()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [browseOpen, setBrowseOpen] = useState(false)
  const renameRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (renamingId !== null) renameRef.current?.focus()
  }, [renamingId])

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open, onClose])

  const createWorkspace = (): void => {
    if (busy) return
    setError(null)
    // P3-⑨:官方用应用内 Miller 目录浏览弹窗代替原生 picker。
    setBrowseOpen(true)
  }

  const startRename = (workspace: WorkspaceView): void => {
    setRenamingId(workspace.workspaceId)
    setRenameText(workspace.title)
  }

  const submitRename = async (workspaceId: string): Promise<void> => {
    const title = renameText.trim()
    if (title === '') { setRenamingId(null); return }
    setBusy(true)
    setError(null)
    const ok = await workspaceActions.rename(workspaceId, title)
    setBusy(false)
    setRenamingId(null)
    if (!ok) setError('重命名失败（名称可能冲突）')
  }

  const removeWorkspace = async (workspaceId: string): Promise<void> => {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await workspaceActions.delete(workspaceId)
    setBusy(false)
    if (!ok) setError('删除失败')
  }

  return (
    <div ref={rootRef} className="workspace-menu-wrap">
      <button
        className="shell-workspace"
        type="button"
        title="切换工作区"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggle}
      >
        工作区
        <span className="shell-workspace-name">{current?.title ?? 'fixture'}</span>
        <span className="shell-workspace-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="workspace-menu" role="menu" aria-label="工作区">
          <div className="workspace-menu-header">工作区</div>
          {workspaces.map(workspace => {
            const isCurrent = workspace.workspaceId === current?.workspaceId
            return (
              <div key={workspace.workspaceId} className="workspace-menu-item" data-current={isCurrent || undefined}>
                {renamingId === workspace.workspaceId ? (
                  <div className="workspace-menu-rename">
                    <input
                      ref={renameRef}
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); void submitRename(workspace.workspaceId) }
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      aria-label="工作区名称"
                    />
                    <button type="button" className="workspace-menu-btn" onClick={() => void submitRename(workspace.workspaceId)} disabled={busy}>保存</button>
                  </div>
                ) : (
                  <>
                    <span className="workspace-menu-title" title={workspace.path}>{workspace.title}</span>
                    {isCurrent && <span className="workspace-menu-current" aria-label="当前">✓</span>}
                    <span className="workspace-menu-actions">
                      <button type="button" className="workspace-menu-btn" onClick={() => startRename(workspace)} title="重命名">▸ 重命名</button>
                      <button type="button" className="workspace-menu-btn workspace-menu-btn-danger" onClick={() => void removeWorkspace(workspace.workspaceId)} disabled={busy} title="删除">删除</button>
                    </span>
                  </>
                )}
              </div>
            )
          })}
          {workspaces.length === 0 && <div className="workspace-menu-empty">暂无工作区</div>}
          {error !== null && <div className="workspace-menu-error">{error}</div>}
          <button type="button" className="workspace-menu-create" onClick={createWorkspace} disabled={busy}>
            + 新建工作区
          </button>
        </div>
      )}
      <WorkspaceDirectoryBrowser
        open={browseOpen}
        onClose={() => { setBrowseOpen(false) }}
        onCreated={() => { setBrowseOpen(false); onClose() }}
      />
    </div>
  )
}
