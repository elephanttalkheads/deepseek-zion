/**
 * Plugin runtime 底座 — React 单例 hub (Q17A)。
 *
 * 持有唯一的 PluginRuntime 与 SlotRegistry,提供 usePlugins() hook 给锚点
 * 与 PluginDock。加载演示插件由 PluginHost 在挂载时调用。
 */
import { createContext, useContext } from 'react'
import { PluginRuntime, type DynamicPluginLoadResult, type DynamicPluginPackage } from './runtime.ts'
import { SlotRegistry, type StoredEntry, type SlotSpec } from './slot-registry.ts'
import { CordisRunOrchestrator, type CordisRunActivity, type CordisRunFailure } from './run-orchestrator.ts'
import { createCordisRunnerRemote, type CordisDynamicRunRequest } from './remote.ts'

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
  /** cordis_run 编排:接入 host/remote-event 帧的入口。 */
  handleRemoteEvent(event: string, args: unknown[]): void
  /** 当前在途的 run 审批/编排活动(Plugin-keyed)。 */
  runActivity(): ReadonlyMap<string, CordisRunActivity>
  runErrors(): ReadonlyMap<string, CordisRunFailure>
  subscribeRuns(fn: () => void): () => void
  approveRun(requestId: string, approveFutureVersions: boolean): Promise<void>
  declineRun(requestId: string): Promise<void>
}

let singleton: { runtime: PluginRuntime; registry: SlotRegistry; orchestrator: CordisRunOrchestrator } | undefined

function handle(): PluginRuntimeHandle {
  if (singleton === undefined) {
    const registry = new SlotRegistry()
    const remote = createCordisRunnerRemote()
    const runtime = new PluginRuntime({
      slots: registry,
      invoke: async (pluginId, pluginRunId, method, args) => {
        const answered = await remote.invoke(pluginId, pluginRunId, method, args)
        if (!answered.ok) {
          throw new Error(`host.call("${method}") on ${pluginId} did not complete: ${answered.error.code}: ${answered.error.message}`)
        }
        // Business layer: the host half answers with its own ok/error envelope.
        const result = answered.value as { ok?: boolean; code?: string; message?: string; value?: unknown }
        if (result.ok !== false) return result?.value
        const where = `host.call("${method}") on ${pluginId}`
        if (result.code === 'plugin-not-running') {
          throw new Error(`${where} found no active Host half — the Plugin is stopped or was removed.`)
        }
        if (result.code === 'stale-run') {
          throw new Error(`${where} belongs to an activation that has already been replaced.`)
        }
        if (result.code === 'method-not-found') {
          throw new Error(`${where} is not registered: the host half must declare it with harness.handle("${method}", fn).`)
        }
        throw new Error(`${where} failed inside the host handler: ${result.message ?? 'unknown error'}`)
      },
    })
    const orchestrator = new CordisRunOrchestrator(
      runtime,
      {
        runHostHalf: async (agentId, pluginId, packageId, mode, requestId, approveFutureVersions) => {
          const answered = await remote.runHostHalf(agentId, pluginId, packageId, mode, requestId, approveFutureVersions)
          return answered.ok ? answered.value : { ok: false, message: `${answered.error.code}: ${answered.error.message}` }
        },
        getClientCode: async (agentId, pluginId, pluginRunId) => {
          const answered = await remote.getClientCode(agentId, pluginId, pluginRunId)
          if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
          return answered.value
        },
        resolveRequestRun: async (requestId, resolution) => {
          const answered = await remote.resolveRequestRun(requestId, resolution)
          if (!answered.ok) throw new Error(`${answered.error.code}: ${answered.error.message}`)
          return answered.value
        },
      },
      async (pkg) => { await runtime.load(pkg) },
    )
    singleton = { runtime, registry, orchestrator }
  }
  const { runtime, registry, orchestrator } = singleton
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
    handleRemoteEvent: (event, args) => {
      if (event === 'cordis/request-run') {
        const request = args[0] as CordisDynamicRunRequest
        orchestrator.open(request)
      } else if (event === 'cordis/request-run-resolved') {
        const resolved = args[0] as { requestId: string }
        orchestrator.close(resolved.requestId)
      }
    },
    runActivity: () => orchestrator.activeRuns.getSnapshot(),
    runErrors: () => orchestrator.lastRunError.getSnapshot(),
    subscribeRuns: (fn) => {
      const offA = orchestrator.activeRuns.subscribe(fn)
      const offB = orchestrator.lastRunError.subscribe(fn)
      return () => { offA(); offB() }
    },
    approveRun: (requestId, approveFutureVersions) => orchestrator.approve(requestId, approveFutureVersions),
    declineRun: (requestId) => orchestrator.decline(requestId),
  }
}

// Probe hook: lets automated acceptance tests deliver host/remote-event frames
// exactly as the wire pump would (same handleRemoteEvent code path).
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__zionProbeHandleRemoteEvent = (event: string, args: unknown[]) => {
    handle().handleRemoteEvent(event, args)
  }
}

/** Non-hook access to the singleton handle (wire event pump, effects, etc.). */
export function getPluginRuntimeHandle(): PluginRuntimeHandle {
  return handle()
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
