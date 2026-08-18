/**
 * Plugin runtime 底座 — cordis_run 审批编排器 (Q17A/cordis_run)。
 *
 * 页面侧 run orchestration:接收 host/remote-event 的 cordis/request-run 与
 * request-run-resolved 事件,维护 Plugin-keyed activity(awaiting-approval /
 * orchestrating),提供 approve/decline;approve 后驱动
 * runHostHalf → getClientCode → runner.load → resolveRequestRun。
 * 状态经 observable 暴露给 PluginHost 审批卡。
 */
import type { PluginRuntime } from './runtime.ts'
import type { DynamicPluginPackage } from './runtime.ts'
import type { CordisDynamicRunRequest, DynamicCordisRunResolution } from './remote.ts'

export type CordisRunActivity =
  | {
    phase: 'awaiting-approval'
    requestId: string
    agentId: string
    packageId: string
    mode: 'run' | 'update'
    name: string
    purpose: string
  }
  | { phase: 'orchestrating'; agentId: string; packageId: string; mode: 'run' | 'update' }

export interface CordisRunFailure {
  packageId: string
  reason: 'host-half-failed' | 'client-half-failed'
  message: string
  stack?: string
}

export interface CordisRunHostSeam {
  runHostHalf(
    agentId: string, pluginId: string, packageId: string, mode: 'run' | 'update',
    requestId: string | null, approveFutureVersions: boolean,
  ): Promise<{ ok: boolean; pluginRunId?: string; waitingFor?: readonly string[]; startedHere?: boolean; message?: string }>
  getClientCode(agentId: string, pluginId: string, pluginRunId: string): Promise<{ code: string; name: string; pluginId: string; packageId: string; pluginRunId: string }>
  resolveRequestRun(requestId: string, resolution: DynamicCordisRunResolution): Promise<{ accepted: boolean }>
}

type Observable<T> = { getSnapshot(): T; subscribe(fn: () => void): () => void }

function createObservable<T>(initial: T): Observable<T> & { _set(next: T): void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    _set(next) { value = next; for (const fn of [...listeners]) fn() },
  }
}

export class CordisRunOrchestrator {
  private readonly requests = new Map<string, CordisDynamicRunRequest>()
  private readonly activity = new Map<string, CordisRunActivity>()
  private readonly failures = new Map<string, CordisRunFailure>()
  private readonly inFlight = new Map<string, Promise<void>>()
  readonly activeRuns: Observable<ReadonlyMap<string, CordisRunActivity>> = createObservable(new Map())
  readonly lastRunError: Observable<ReadonlyMap<string, CordisRunFailure>> = createObservable(new Map())

  constructor(
    _runner: PluginRuntime,
    private readonly host: CordisRunHostSeam,
    private readonly loadClient: (pkg: DynamicPluginPackage) => Promise<void>,
  ) {}

  /** Register an activation request; auto-orchestrate when pre-authorized. */
  open(request: CordisDynamicRunRequest): void {
    this.requests.set(request.requestId, request)
    if (!request.requiresApproval) {
      void this.orchestrate({
        agentId: request.agentId, pluginId: request.pluginId, packageId: request.packageId,
        mode: request.mode, requestId: request.requestId, approveFutureVersions: false,
      }).catch((error: unknown) => {
        console.error(`[cordis-run] automatic activation ${request.requestId} failed:`, error)
      })
      return
    }
    if (this.activity.get(request.pluginId)?.phase !== 'orchestrating') {
      this.activity.set(request.pluginId, {
        phase: 'awaiting-approval', requestId: request.requestId, agentId: request.agentId,
        packageId: request.packageId, mode: request.mode, name: request.name, purpose: request.purpose,
      })
    }
    this.commit()
  }

  /** Close a request settled elsewhere. */
  close(requestId: string): void {
    const request = this.requests.get(requestId)
    if (request === undefined) return
    this.requests.delete(requestId)
    const current = this.activity.get(request.pluginId)
    if (current?.phase === 'awaiting-approval' && current.requestId === requestId) {
      this.activity.delete(request.pluginId)
    }
    this.commit()
  }

  /** Approve and execute one still-open request. */
  approve(requestId: string, approveFutureVersions: boolean): Promise<void> {
    const request = this.requests.get(requestId)
    if (request === undefined || !request.requiresApproval) return Promise.resolve()
    return this.orchestrate({
      agentId: request.agentId, pluginId: request.pluginId, packageId: request.packageId,
      mode: request.mode, requestId, approveFutureVersions,
    })
  }

  /** Decline one still-open request without executing either half. */
  async decline(requestId: string): Promise<void> {
    const request = this.requests.get(requestId)
    if (request === undefined || !request.requiresApproval) return
    const current = this.activity.get(request.pluginId)
    if (current?.phase !== 'awaiting-approval' || current.requestId !== requestId) return
    this.requests.delete(requestId)
    this.activity.delete(request.pluginId)
    this.commit()
    await this.answer(requestId, { ok: false, reason: 'rejected' })
  }

  private commit(): void {
    ;(this.activeRuns as unknown as { _set(n: ReadonlyMap<string, CordisRunActivity>): void })._set(new Map(this.activity))
    ;(this.lastRunError as unknown as { _set(n: ReadonlyMap<string, CordisRunFailure>): void })._set(new Map(this.failures))
  }

  private orchestrate(plan: {
    agentId: string; pluginId: string; packageId: string; mode: 'run' | 'update'
    requestId?: string; approveFutureVersions?: boolean
  }): Promise<void> {
    const running = this.inFlight.get(plan.pluginId)
    if (running !== undefined) return running
    this.activity.set(plan.pluginId, {
      phase: 'orchestrating', agentId: plan.agentId, packageId: plan.packageId, mode: plan.mode,
    })
    this.failures.delete(plan.pluginId)
    if (plan.requestId !== undefined) this.requests.delete(plan.requestId)
    this.commit()
    const attempt = this.drive(plan).finally(() => {
      this.inFlight.delete(plan.pluginId)
      this.activity.delete(plan.pluginId)
      this.commit()
    })
    this.inFlight.set(plan.pluginId, attempt)
    return attempt
  }

  private async drive(plan: {
    agentId: string; pluginId: string; packageId: string; mode: 'run' | 'update'
    requestId?: string; approveFutureVersions?: boolean
  }): Promise<void> {
    const started = await this.startHost(plan)
    if (!started.ok) {
      this.fail(plan, 'host-half-failed', started.message ?? 'host activation failed')
      if (plan.requestId !== undefined) await this.answer(plan.requestId, { ok: false, reason: 'host-half-failed', message: started.message })
      return
    }
    const pluginRunId = started.pluginRunId
    if (pluginRunId === undefined) return

    let source
    try {
      source = await this.host.getClientCode(plan.agentId, plan.pluginId, pluginRunId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.finishClientFailure(plan, pluginRunId, message, error)
      return
    }
    try {
      await this.loadClient({
        pluginId: source.pluginId, packageId: source.packageId, pluginRunId: source.pluginRunId,
        name: source.name, clientCode: source.code,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.finishClientFailure(plan, pluginRunId, message, error)
      return
    }
    const resolution: DynamicCordisRunResolution = { ok: true, pluginRunId }
    if (plan.requestId !== undefined) await this.answer(plan.requestId, resolution)
  }

  private async startHost(plan: {
    agentId: string; pluginId: string; packageId: string; mode: 'run' | 'update'
    requestId?: string; approveFutureVersions?: boolean
  }): Promise<{ ok: boolean; pluginRunId?: string; message?: string }> {
    try {
      return await this.host.runHostHalf(
        plan.agentId, plan.pluginId, plan.packageId, plan.mode,
        plan.requestId ?? null, plan.approveFutureVersions ?? false,
      )
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  private async finishClientFailure(
    plan: { pluginId: string; packageId: string; requestId?: string },
    pluginRunId: string, message: string, original?: unknown,
  ): Promise<void> {
    console.error(`[cordis-run] Client activation ${plan.pluginId}/${plan.packageId} (${pluginRunId}) failed:`, original ?? message)
    this.fail(plan, 'client-half-failed', message)
    const resolution: DynamicCordisRunResolution = { ok: false, reason: 'client-half-failed', pluginRunId, message }
    if (plan.requestId !== undefined) await this.answer(plan.requestId, resolution)
  }

  private async answer(requestId: string, resolution: DynamicCordisRunResolution): Promise<void> {
    try {
      await this.host.resolveRequestRun(requestId, resolution)
    } catch (error) {
      console.error(`[cordis-run] answering run request ${requestId} failed:`, error)
    }
  }

  private fail(plan: { pluginId: string; packageId: string }, reason: CordisRunFailure['reason'], message: string): void {
    this.failures.set(plan.pluginId, { packageId: plan.packageId, reason, message })
    this.commit()
  }
}
