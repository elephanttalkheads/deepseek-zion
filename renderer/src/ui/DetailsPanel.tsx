/**
 * DetailsPanel — right column (M1 placeholder). Official right column is the
 * tool-details surface (vendored client-ui-conversation skeleton/DetailsPanel:
 * selected call's args/result; L6 not wired yet) — no subagent panel (removed
 * 2026-08-29, zion-add; official subagent semantics = session-header tree +
 * read-only composer + hierarchy breadcrumb). Current contents: placeholder
 * text + the settings.plugin.item additive slot anchor (dynamic plugin
 * settings cards).
 */
import { useRuntime } from '../app/runtime.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'

export function DetailsPanel(): JSX.Element {
  const { selectedSessionId } = useRuntime()
  return (
    <div className="details">
      {selectedSessionId === undefined && <p className="details-muted">No selection</p>}
      <div className="details-plugins">
        <SlotAnchor slot="settings.plugin.item" ownerProps={{ sessionId: selectedSessionId }} />
      </div>
    </div>
  )
}
