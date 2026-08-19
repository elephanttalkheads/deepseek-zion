/**
 * Type-only stub for `@deepseek-ai/dsh-subagent/client` (descriptor-backed
 * subagent domain; the client namespace re-exports the projection types).
 * Mirrors `profiles/node_modules/@deepseek-ai/dsh-subagent/lib/types/projection-types.d.ts`
 * (SubagentTimingProjection + SessionProjectionMap merge), so
 * SubagentCatalogAction's token/duration metrics typecheck.
 */
declare module '@deepseek-ai/dsh-subagent/client' {
  /** Durable active-turn timing for one descriptor-backed child session. */
  export interface SubagentTimingProjection {
    /** Milliseconds accumulated across completed turns after the child's own descriptor. */
    settledMs: number
    /** Same-cut bounds of the currently open turn, when one has not reached `turn/end`. */
    active?: {
      /** Start of the open turn. */
      since: number
      /** Latest event time folded into this projection cut. */
      through: number
    }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Active-turn duration for a descriptor-backed subagent session. */
    subagentTiming: import('@deepseek-ai/dsh-subagent/client').SubagentTimingProjection
  }
}
