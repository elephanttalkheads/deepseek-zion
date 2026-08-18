/**
 * AppFrame — three-column replica of the official layout
 * (sidebar | conversation | details), with the shell top bar.
 * M1: sidebar hosts the session list; conversation shows the empty/hero state;
 * details is a placeholder. Column drag is a thin enhancement (M1 keeps widths
 * fixed; exact drag behavior is tracked for the 1:1 pass).
 */
import { useState } from 'react'
import { Sidebar } from './Sidebar.tsx'
import { ConversationDock } from './ConversationDock.tsx'
import { DetailsPanel } from './DetailsPanel.tsx'
import { useRuntime } from '../app/runtime.tsx'

export function AppFrame(): JSX.Element {
  const { connectionState, isFixture, workspaces } = useRuntime()
  const [query, setQuery] = useState('')
  const workspaceName = workspaces.length > 0 ? (workspaces[0]?.title ?? 'fixture') : 'fixture'

  return (
    <div className="app-frame" data-connection={connectionState}>
      <header className="shell-topbar">
        <span className="shell-brand">
          <span className="shell-brand-dot" aria-hidden="true" />
          DeepSeek Harness
        </span>
        <button className="shell-new" type="button" title="New session" onClick={() => { /* M2: sessions.create */ }}>
          新会话
        </button>
        <span className="shell-right">
          <button className="shell-workspace" type="button" title="Switch workspace">
            工作区
            <span className="shell-workspace-name">{workspaceName}</span>
          </button>
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
    </div>
  )
}
