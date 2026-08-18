/**
 * Local type shims for vendored official sources that reference module shapes
 * whose exports resolution our bundler/tsc layout doesn't satisfy out of the
 * box. Runtime code is untouched — these only widen the type surface.
 */

// use-sync-external-store ships .js in "exports" without a types entry that
// resolvable order; @types exists but exports-map blocks resolution in our
// bundler resolution mode. Surface the exact API bind.ts uses.
declare module 'use-sync-external-store/shim/with-selector.js' {
  export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => Snapshot,
    getServerSnapshot: Snapshot | null | undefined,
    selector: (snapshot: Snapshot) => Selection,
    isEqual?: ((a: Selection, b: Selection) => boolean) | undefined,
  ): Selection
}

// The cordis Context carries `remote` only after plugin/service declaration
// merging; the vendored runtime's remotes.ts type-picks it. Declare the
// minimal shape we actually need so that type-only import compiles. The
// vendored official conversation modules construct `new Context()` at runtime
// (a real cordis value export), so surface a minimal value too.
declare module '@deepseek-ai/cordis' {
  interface RemoteFailure {
    readonly code: string
    readonly message: string
    readonly details: object
  }
  type RemoteResult<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: RemoteFailure }
  interface Context {
    remote: {
      commands: {
        execute(sessionId: unknown, line: string): Promise<RemoteResult<unknown>>
      }
    }
    provide(name: string, value: unknown): void
    [key: string]: unknown
  }
  interface ContextConstructor {
    new (parent?: Context | null, name?: string): Context
  }
  const Context: ContextConstructor
  export { Context }
}
