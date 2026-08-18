/**
 * DetailsPanel — right column (M1 placeholder). Full details surface (context
 * meter, trajectory, etc.) lands in later milestones.
 */
import { useRuntime } from '../app/runtime.tsx'

export function DetailsPanel(): JSX.Element {
  const { selectedSessionId } = useRuntime()
  return (
    <div className="details">
      {selectedSessionId === undefined ? (
        <p className="details-muted">No selection</p>
      ) : (
        <p className="details-muted">Details — later milestone.</p>
      )}
    </div>
  )
}
