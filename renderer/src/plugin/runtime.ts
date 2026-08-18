/**
 * Plugin runtime 底座 — 直拼 runner (Q17A)。
 *
 * 不走 cordis Loader / ClientModuleSystem bundle:插件 client 半源码头到到
 * 闭包求值器,拿到插件对象后 guard 包 ctx,同步 apply(替代
 * loader.create→resolve→fiber.await),slot 注册落在 SlotRegistry,卸载时
 * 逐条 disposer + styles.dispose + ctx._dispose。
 */
import { MinContext, type MinCtx } from './min-ctx.ts'
import { SlotRegistry } from './slot-registry.ts'
import { evaluateClientHalf, DynamicCordisStyles, type DynamicCordisEvaluatedPlugin } from './evaluator.ts'
import { dynamicCordisContext, type DynamicCordisSlotLedgerRow } from './guard.ts'

export interface DynamicPluginPackage {
  pluginId: string
  packageId: string
  pluginRunId: string
  name?: string
  clientCode: string
}

export interface DynamicPluginLoadResult {
  pluginId: string
  slots: readonly DynamicCordisSlotLedgerRow[]
  styles: number
}

export interface PluginRuntimeOptions {
  slots: SlotRegistry
  /** host.call(method, args) route to the active Host half of one exact run
   *  (official invoke): pluginId/pluginRunId are bound per load. */
  invoke?(pluginId: string, pluginRunId: string, method: string, args: unknown): Promise<unknown>
  reportError?(pluginId: string, error: Error): void
}

/** Minimal observable: {getSnapshot,subscribe} mirroring the official face. */
export type Snapshot<T> = { getSnapshot(): T; subscribe(fn: () => void): () => void; _set(next: T): void }

export function createObservable<T>(initial: T): Snapshot<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    _set(next: T) {
      value = next
      for (const fn of [...listeners]) fn()
    },
  }
}

export class PluginRuntime {
  private readonly options: Required<PluginRuntimeOptions>
  private readonly live = new Map<string, { ctx: MinContext; styles: DynamicCordisStyles; disposers: Array<() => void> }>()
  readonly active = createObservable<readonly DynamicPluginPackage[]>([])
  readonly slotsLedger = createObservable<readonly DynamicCordisSlotLedgerRow[]>([])
  private nextPriority = 0

  constructor(options: PluginRuntimeOptions) {
    this.options = {
      invoke: async () => { throw new Error('host.call is unavailable in the replica plugin runtime (no host half)') },
      reportError: () => {},
      ...options,
    }
  }
  /** Load + apply one client half; returns registered slots snapshot. */
  async load(pkg: DynamicPluginPackage): Promise<DynamicPluginLoadResult> {
    const styles = new DynamicCordisStyles(pkg.pluginId)
    const env = {
      invoke: (method: string, args: unknown) => this.options.invoke(pkg.pluginId, pkg.pluginRunId, method, args),
      noteError: (message: string) => console.error(`[cordis:${pkg.pluginId}]`, message),
    }
    let plugin: DynamicCordisEvaluatedPlugin | ((ctx: unknown) => unknown)
    try {
      plugin = await evaluateClientHalf(pkg.pluginId, pkg.clientCode, env, styles)
    } catch (error) {
      styles.dispose()
      throw error
    }

    const declared = Array.isArray(plugin) ? [] : (plugin as DynamicCordisEvaluatedPlugin).inject ?? []
    const ctx = new MinContext(declared)
    ctx.provide('slots', this.options.slots)

    const disposers: Array<() => void> = []
    const ledger: DynamicCordisSlotLedgerRow[] = []
    const guardEnv = {
      pkg: { pluginId: pkg.pluginId, packageId: pkg.packageId, pluginRunId: pkg.pluginRunId, name: pkg.name },
      ledger,
      claim: () => {},
      allocatePriority: () => --this.nextPriority,
      reportFailure: (error: Error) => this.options.reportError(pkg.pluginId, error),
      trackSlotDispose: (fn: () => void) => { disposers.push(fn) },
    }
    const guarded = dynamicCordisContext(ctx, guardEnv)

    const ctxWithTrack = new Proxy(guarded, {
      get(target, prop, receiver) {
        if (prop === 'effect') {
          return (fn: () => void, label?: string) => {
            const d = ctx.effect(fn, label)
            disposers.push(d)
            return d
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })

    try {
      const surface = typeof plugin === 'function'
        ? { apply: (c: MinCtx) => plugin(c) }
        : { apply: (c: MinCtx, cfg?: unknown) => (plugin as DynamicCordisEvaluatedPlugin).apply(c, cfg) }
      await surface.apply(ctxWithTrack as MinCtx)
    } catch (error) {
      for (const d of disposers) { try { d() } catch { /* ignore */ } }
      styles.dispose()
      ctx._dispose()
      throw error
    }

    const liveCtx = { ctx, styles, disposers }
    this.live.set(pkg.pluginId, liveCtx)
    this.active._set([...this.active.getSnapshot(), pkg])
    this.slotsLedger._set(ledger)
    return { pluginId: pkg.pluginId, slots: ledger, styles: styles.count }
  }

  /** Unload a plugin: slot disposers (registry-held), styles, ctx effects. */
  async unload(pluginId: string): Promise<void> {
    const live = this.live.get(pluginId)
    if (live !== undefined) {
      for (const d of live.disposers) { try { d() } catch { /* ignore */ } }
      live.styles.dispose()
      live.ctx._dispose()
      this.live.delete(pluginId)
    }
    this.active._set(this.active.getSnapshot().filter(p => p.pluginId !== pluginId))
    this.slotsLedger._set([])
  }
}
