/**
 * DetailsPanel — right column (M1 placeholder). Full details surface (context
 * meter, trajectory, etc.) lands in later milestones. M4: hosts the
 * settings.plugin.item additive slot anchor (dynamic plugin settings cards).
 */
import { useRuntime } from '../app/runtime.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { SubagentPanel } from './SubagentPanel.tsx'

export function DetailsPanel(): JSX.Element {
  const { selectedSessionId } = useRuntime()
  return (
    <div className="details">
      {selectedSessionId === undefined ? (
        <p className="details-muted">No selection</p>
      ) : (
        <SubagentPanel />
      )}
      <div className="details-plugins">
        <SlotAnchor slot="settings.plugin.item" ownerProps={{ sessionId: selectedSessionId }} />
      </div>
    </div>
  )
}
