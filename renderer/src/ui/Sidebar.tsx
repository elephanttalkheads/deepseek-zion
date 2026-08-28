/**
 * Sidebar — ASCII 会话城(ZION sidebar 迁移,2026-08-28 落地;决策记录见
 * ui-prototype/sidebar/DECISIONS.md,形态基准 ui-prototype/sidebar/replica/)。
 * 壳:品牌头 + 固定工具条(搜索/视图选项/新建/添加工作区/⚙)+ CityFrame(城市)
 * + CityIndex(覆盖索引)+ footer(SlotAnchor)+ 右缘调宽 280–420px。
 * 数据语义全部走既有面:useSessions / selectSession / createSession /
 * sessionRowActions / workspaceActions / WorkspaceDirectoryBrowser / SettingsShell,
 * 只动结构与视觉(语义零改动)。旧列表形态删除,行级入口迁入 CityIndex 行内。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { SettingsShell } from './SettingsShell.tsx'
import { WorkspaceDirectoryBrowser } from '../app/directory-browser.tsx'
import { Menu } from '../../vendor/ui-primitives/Menu.tsx'
import { IconPersonalizationOutline16 } from '../../vendor/ui-primitives/icons/index.tsx'
import type { SessionId } from '../../vendor/client-connection/client/api.ts'
import { useWorkspaceCityModel } from './sidebar-city/useWorkspaceCityModel.ts'
import { useCityCamera } from './sidebar-city/useCityCamera.ts'
import { CityFrame } from './sidebar-city/CityFrame.tsx'
import { CityIndex } from './sidebar-city/CityIndex.tsx'

/** 侧栏宽度边界(源原型 280–420px,--sidebar-width 驱动 app-grid 列宽)。 */
const SIDEBAR_MIN_W = 280
const SIDEBAR_MAX_W = 420

export function Sidebar({ query, onQueryChange }: { query: string; onQueryChange: (q: string) => void }): JSX.Element {
  const { useSessions, selectSession, selectedSessionId, createSession } = useRuntime()
  const listState = useSessions(s => s.state)
  const [view, setView] = useState<{ groupBy: 'workspace' | 'flat'; orderBy: 'updated' | 'manual' }>({ groupBy: 'workspace', orderBy: 'updated' })
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)

  const model = useWorkspaceCityModel(query, view.orderBy, selectedSessionId ?? null)
  const camera = useCityCamera(model.workspaces, mapOpen)

  /** 城市模型里是 plain string,跨进运行时数据面前回到 SessionId brand。 */
  const handleSelectSession = (id: string): void => selectSession(id as SessionId)

  const selectedWorkspaceId = useMemo(
    () => (selectedSessionId != null ? model.workspaceOf.get(selectedSessionId) ?? null : null),
    [model, selectedSessionId],
  )

  const locateWorkspace = (workspaceId: string): void => {
    const index = model.workspaces.findIndex(w => w.id === workspaceId)
    if (index === -1) return
    camera.navigateToWorkspace(index)
    setMapOpen(false)
  }

  // M 开关索引;Esc 关索引/视图菜单(行走键在 useCityCamera)。
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement).matches('input, textarea, [contenteditable]')) return
      if (event.key === 'Escape') {
        if (viewMenuOpen) { setViewMenuOpen(false); return }
        if (mapOpen) { event.preventDefault(); setMapOpen(false) }
        return
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault()
        setMapOpen(v => !v)
      }
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [mapOpen, viewMenuOpen])

  // 右缘拖拽调宽 280–420px(用户裁决保留;--sidebar-width 驱动 app-grid 列)。
  const widthHandleRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const handle = widthHandleRef.current
    if (handle === null) return
    const onPointerDown = (event: PointerEvent): void => {
      event.stopPropagation()
      event.preventDefault()
      const startX = event.clientX
      const startW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || SIDEBAR_MIN_W
      document.body.classList.add('resizing-width')
      handle.setPointerCapture(event.pointerId)
      const move = (e: PointerEvent): void => {
        const w = Math.round(Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, startW + e.clientX - startX)))
        document.documentElement.style.setProperty('--sidebar-width', `${w}px`)
      }
      const up = (): void => {
        document.body.classList.remove('resizing-width')
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    }
    handle.addEventListener('pointerdown', onPointerDown)
    return () => handle.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <div className="sidebar" data-experience={camera.reduced ? 'reduced' : 'cinematic'}>
      <header className="sidebar-head">
        <div>
          <span className="brand-kicker">ZION NAVIGATION PROTOCOL</span>
          <h1 className="brand-name">ASCII <em>DISTRICT</em></h1>
        </div>
        <div className="head-status">LINKED</div>
      </header>

      <div className="sidebar-toolbar" role="toolbar" aria-label="会话浏览工具条">
        <input
          className="sidebar-search-input"
          type="search"
          placeholder="搜索会话…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          aria-label="搜索会话(标题或 id)"
        />
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
          anchor={(
            <button
              type="button"
              className="toolbar-btn sidebar-view-options"
              title="视图选项"
              aria-label="视图选项"
              aria-haspopup="menu"
              aria-expanded={viewMenuOpen}
              onClick={() => setViewMenuOpen(v => !v)}
            >
              <IconPersonalizationOutline16 />
            </button>
          )}
        />
        <button className="toolbar-btn sidebar-new" type="button" title="新建会话" aria-label="新建会话" onClick={() => void createSession()}>
          +
        </button>
        <button
          className="toolbar-btn sidebar-add-workspace"
          type="button"
          title="添加工作区"
          aria-label="添加工作区"
          onClick={() => setBrowseOpen(true)}
        >
          ⌂
        </button>
        <button
          className="toolbar-btn sidebar-settings-trigger"
          type="button"
          data-open={settingsOpen || undefined}
          onClick={() => setSettingsOpen(o => !o)}
          title="设置"
          aria-label="设置"
        >
          ⚙
        </button>
      </div>

      {listState === 'error'
        ? <div className="sidebar-hint sidebar-error">Failed to load sessions.</div>
        : (
          <CityFrame
            model={model.workspaces}
            camera={camera}
            selectedSessionId={selectedSessionId ?? null}
            total={model.total}
            mapOpen={mapOpen}
            onSelectSession={handleSelectSession}
            onToggleMap={() => setMapOpen(v => !v)}
          />
        )}

      <CityIndex
        model={model.workspaces}
        open={mapOpen}
        flat={view.groupBy === 'flat'}
        orderBy={view.orderBy}
        selectedSessionId={selectedSessionId ?? null}
        selectedWorkspaceId={selectedWorkspaceId}
        reduced={camera.reduced}
        onSelectSession={handleSelectSession}
        onLocateWorkspace={locateWorkspace}
      />

      <div className="sidebar-foot" aria-label="插件动作槽">
        <SlotAnchor slot="sidebar.footer.action" ownerProps={{}} />
      </div>

      <div
        className="width-handle"
        ref={widthHandleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拽调整侧栏宽度"
        title="拖拽调整宽度 (280-420px)"
      />

      <SettingsShell open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WorkspaceDirectoryBrowser
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onCreated={() => setBrowseOpen(false)}
      />
    </div>
  )
}
