/**
 * Type-only stub for `@deepseek-ai/dsh-session-stats/client` (host-side
 * session-stats domain; the client namespace re-exports the projection type).
 * Mirrors `packages/session/session-stats/src/types.ts` exactly, including the
 * SessionProjectionMap declaration (StatsLine typecheck).
 */
declare module '@deepseek-ai/dsh-session-stats/client' {
  /** Whole-value `sessionStats` projection: durable per-session aggregates. */
  export interface SessionStatsProjection {
    turns: number
    steps: number
    llmMs: number
    toolMs: number
    ttftMs: number
    ttftSteps: number
    decodeMs: number
    decodeTokens: number
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Durable session aggregates (paging/compaction cannot change them). */
    sessionStats: import('@deepseek-ai/dsh-session-stats/client').SessionStatsProjection
  }
}
