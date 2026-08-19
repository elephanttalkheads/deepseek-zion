/**
 * Type-only stub for `@deepseek-ai/dsh-plan-mode/client` (host-side plan-mode
 * service; the client namespace re-exports the projection types).
 * Mirrors `packages/plan/plan-mode/src/types.ts` exactly, including the
 * SessionProjectionMap declaration (so vendored PlanChip's useProjection('plan')
 * typechecks).
 */
declare module '@deepseek-ai/dsh-plan-mode/client' {
  /**
   * The plan projection's wire value. `active` is the logged state in force
   * (the last `plan/mode`, inactive before the first); `pending` is true while
   * a logged `/plan` selection (`command/run`) targets a state other than
   * `active` and no later `plan/mode` event has recorded that state. Capability
   * absence (plan-mode not composed) is the key's absence, never a value.
   */
  export interface PlanProjection {
    active: boolean
    pending: boolean
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Plan collaboration state folded from `command/run` (name `plan`) and `plan/mode` events. */
    plan: import('@deepseek-ai/dsh-plan-mode/client').PlanProjection
  }
}
