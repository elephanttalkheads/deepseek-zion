/**
 * Type-only stub for `@deepseek-ai/dsh-tool-todo/client` (host-side todo
 * domain; the client namespace re-exports the payload types). Mirrors
 * `packages/todo/tool-todo/src/types.ts` exactly, including the
 * SessionProjectionMap declaration (TodoDock typecheck). TodoItem re-exports
 * from the real `@deepseek-ai/dsh-session/types` package.
 */
declare module '@deepseek-ai/dsh-tool-todo/client' {
  export type { TodoItem } from '@deepseek-ai/dsh-session/types'
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    /**
     * The session's standing plan: the whole-list snapshot of the latest
     * `todo/write` (cleared on the next `turn/start`); `null` = none written
     * yet, `[]` = an empty list was written.
     */
    todos: import('@deepseek-ai/dsh-session/types').TodoItem[] | null
  }
}
