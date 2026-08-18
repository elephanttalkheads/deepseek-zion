/**
 * Plugin runtime 底座 — React 单例 hub (Q17A)。
 *
 * 持有唯一的 PluginRuntime 与 SlotRegistry,提供 usePlugins() hook 给锚点
 * 与 PluginDock。加载演示插件由 PluginHost 在挂载时调用。
 */
import { createContext, useContext } from 'react'
import { PluginRuntime, type DynamicPluginLoadResult, type DynamicPluginPackage } from './runtime.ts'
import { SlotRegistry, type StoredEntry, type SlotSpec } from './slot-registry.ts'

export interface PluginRuntimeHandle {
  /** Load one dynamic client half (源码即闭包). */
  load(pkg: DynamicPluginPackage): Promise<DynamicPluginLoadResult>
  unload(pluginId: string): Promise<void>
  /** Currently loaded packages. */
  active(): readonly DynamicPluginPackage[]
  slots: {
    spec(slot: string): SlotSpec | undefined
    entries(slot: string): readonly StoredEntry[]
    winner(slot: string, key?: string): StoredEntry | undefined
  }
  /** Subscribe to load/unload changes (anchor re-render). */
  subscribe(fn: () => void): () => void
  reportError(pluginId: string, error: unknown): void
}

let singleton: { runtime: PluginRuntime; registry: SlotRegistry } | undefined

function handle(): PluginRuntimeHandle {
  if (singleton === undefined) {
    const registry = new SlotRegistry()
    const runtime = new PluginRuntime({ slots: registry })
    singleton = { runtime, registry }
  }
  const { runtime, registry } = singleton
  return {
    load: (pkg) => runtime.load(pkg),
    unload: (id) => runtime.unload(id),
    active: () => runtime.active.getSnapshot(),
    slots: {
      spec: (s) => registry.spec(s),
      entries: (s) => registry.entries(s),
      winner: (s, k) => registry.winner(s, k),
    },
    subscribe: (fn) => {
      const offA = runtime.active.subscribe(fn)
      const offB = runtime.slotsLedger.subscribe(fn)
      return () => { offA(); offB() }
    },
    reportError: (id, error) => {
      console.error(`[plugin:${id}]`, error)
    },
  }
}

const PluginContext = createContext<PluginRuntimeHandle | null>(null)

export function PluginProvider({ children }: { children: React.ReactNode }): JSX.Element {
  return <PluginContext.Provider value={handle()}>{children}</PluginContext.Provider>
}

export function usePlugins(): PluginRuntimeHandle {
  const value = useContext(PluginContext)
  if (value === null) throw new Error('usePlugins: missing PluginProvider (mount <PluginProvider> in the app root)')
  return value
}
