/**
 * Type-only stub for `@deepseek-ai/dsh-token-meter/client` (host-side
 * token-meter domain; the client namespace re-exports the projection types).
 * Mirrors `packages/llm/token-meter/src/projection.ts` exactly, including the
 * SessionProjectionMap declarations (ContextMeter/StatsLine typecheck).
 */
declare module '@deepseek-ai/dsh-token-meter/client' {
  /** Whole-value `tokenUsage` projection: the latest usage sample replaces the prior one. */
  export interface TokenUsageProjection {
    uncachedInputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }

  /**
   * Provider-reported prompt size of the most recent request (uncached input
   * tokens). Optional: the estimator reports none for some routes.
   */
  export interface ContextPressureProjection {
    /** Provider-reported prompt size of the most recent request: uncached input tokens. */
    pressureTokens?: number
    /** What the NEXT request's prompt would cost: pressure plus pending turns. */
    projectedTokens?: number
    /** The route's context capacity (0/absent = no stated window). */
    contextWindow?: number
  }

  /** Heuristic composition of the next request's context (three-part). */
  export interface ContextBreakdownProjection {
    systemTokens: number
    toolsTokens: number
    messageTokens: number
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /** Last-usage-sample token accounting (survives paging/compaction). */
    tokenUsage: import('@deepseek-ai/dsh-token-meter/client').TokenUsageProjection
    /** Provider-reported + projected prompt pressure and route capacity. */
    contextPressure: import('@deepseek-ai/dsh-token-meter/client').ContextPressureProjection
    /** Heuristic three-part composition of the next request's context. */
    contextBreakdown: import('@deepseek-ai/dsh-token-meter/client').ContextBreakdownProjection
  }
}
