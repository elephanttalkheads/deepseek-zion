/**
 * AppFrame — three-column replica of the official layout
 * (sidebar | conversation | details), with the shell top bar.
 * M1: sidebar hosts the session list; conversation shows the empty/hero state;
 * details is a placeholder. Column drag is a thin enhancement (M1 keeps widths
 * fixed; exact drag behavior is tracked for the 1:1 pass).
 */
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar.tsx'
import { ConversationDock } from './ConversationDock.tsx'
import { DetailsPanel } from './DetailsPanel.tsx'
import { PluginHost } from './PluginHost.tsx'
import { WorkspaceMenu } from './WorkspaceMenu.tsx'
import RainCanvas from './RainCanvas.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { useRuntime } from '../app/runtime.tsx'
import { setAmbientBusy } from '../app/ambient-fx.ts'

export function AppFrame(): JSX.Element {
  const { connectionState, isFixture, workspaces, createSession, wire, selectedSessionId } = useRuntime()
  const [query, setQuery] = useState('')
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const current = workspaces.length > 0 ? workspaces[0] : undefined

  // ZION 块 1 fx 驱动:订阅选中会话 running 快照 → 写模块级 fx 两档
  // (READY {1,0.3} / 忙碌 {2.2,0.85})。手动 subscribe,不进 React 渲染路径
  // (uSES 与 vendor 订阅叠加会死循环,见 zion-ui-migration skill 陷阱)。
  useEffect(() => {
    if (selectedSessionId === undefined) {
      setAmbientBusy(false)
      return
    }
    const session = wire.sessions.get(selectedSessionId)
    const sync = (): void => setAmbientBusy(session.getSnapshot().running)
    sync()
    return session.subscribe(sync)
  }, [wire, selectedSessionId])

  return (
    <div className="app-frame" data-connection={connectionState}>
      <RainCanvas />
      <div className="scanlines" aria-hidden="true" />
      <SlotAnchor slot="shell.overlay" ownerProps={{ connectionState }} />
      <header className="shell-topbar">
        <span className="shell-brand">
          <span className="shell-brand-dot" aria-hidden="true" />
          DeepSeek Harness
        </span>
        <button className="shell-new" type="button" title="New session" onClick={() => void createSession()}>
          新会话
        </button>
        <span className="shell-right">
          <WorkspaceMenu
            current={current}
            open={workspaceMenuOpen}
            onToggle={() => setWorkspaceMenuOpen(prev => !prev)}
            onClose={() => setWorkspaceMenuOpen(false)}
          />
          <span className="shell-badge" data-fixture={isFixture}>
            {isFixture ? 'fixture' : connectionState}
          </span>
        </span>
      </header>
      <div className="app-grid">
        <aside className="app-sidebar">
          <Sidebar query={query} onQueryChange={setQuery} />
        </aside>
        <main className="app-conversation">
          <ConversationDock />
        </main>
        <aside className="app-details">
          <DetailsPanel />
        </aside>
      </div>
      <PluginHost />
    </div>
  )
}
