/**
 * Plugin runtime 底座 — dynamicCordisRunner remote 桥 (Q17A/cordis_run)。
 *
 * 官方浏览器经 `ctx.remote.dynamicCordisRunner.*` 调用 host 半,底层是通用
 * Connection RPC:`POST /api/<namespace>/<method>`,body =
 * { type:'client-request', rpcId, method:'dynamicCordisRunner/<method>', payload:{ args } }。
 * 本文件用 vendor 的 createWebConnectionRpc 直接发这个通道(零 cordis)。
 */

import { createWebConnectionRpc } from '../../vendor/client-connection/client/rpc.ts'
import type { ClientConnectionRpc } from '../../vendor/client-connection/rpc.ts'

export type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: object } }

const ENDPOINT = 'dynamicCordisRunner'

export interface CordisDynamicRunRequest {
  requestId: string
  agentId: string
  pluginId: string
  packageId: string
  mode: 'run' | 'update'
  name: string
  purpose: string
  requiresApproval: boolean
}

export interface CordisDynamicRequestResolved {
  requestId: string
  outcome: string
}

export interface DynamicCordisClientSource {
  code: string
  name: string
  pluginId: string
  packageId: string
  pluginRunId: string
}

export interface DynamicCordisHostHalfResult {
  ok: boolean
  pluginId?: string
  packageId?: string
  pluginRunId?: string
  waitingFor?: readonly string[]
  startedHere?: boolean
  message?: string
}

export interface DynamicCordisResolveAck { accepted: boolean }
export interface DynamicCordisRunResponse { ok: boolean; status?: string; message?: string; [k: string]: unknown }

export interface DynamicCordisRunResolution {
  ok: boolean
  reason?: string
  pluginRunId?: string
  startedHere?: boolean
  waitingFor?: readonly string[]
  message?: string
  stack?: string
}

export interface CordisRunnerRemote {
  runHostHalf(
    agentId: string, pluginId: string, packageId: string, mode: 'run' | 'update',
    requestId: string | null, approveFutureVersions: boolean,
  ): Promise<RemoteResult<DynamicCordisHostHalfResult>>
  getClientCode(agentId: string, pluginId: string, pluginRunId: string): Promise<RemoteResult<DynamicCordisClientSource>>
  resolveRequestRun(requestId: string, resolution: DynamicCordisRunResolution): Promise<RemoteResult<DynamicCordisResolveAck>>
  settleUserRun(agentId: string, pluginId: string, resolution: DynamicCordisRunResolution): Promise<RemoteResult<DynamicCordisRunResponse>>
  /** Route host.call(method, args) to the active Host half of one exact run. */
  invoke(pluginId: string, pluginRunId: string, method: string, args: unknown): Promise<RemoteResult<unknown>>
}

/** Build the remote caller over the browser connection RPC channel. */
export function createCordisRunnerRemote(rpc: ClientConnectionRpc = createWebConnectionRpc()): CordisRunnerRemote {
  const call = async <T>(method: string, args: Record<string, unknown>): Promise<RemoteResult<T>> => {
    const result = await rpc.call('/api', `${ENDPOINT}/${method}`, { args })
    if (result.ok) return { ok: true, value: result.value as T }
    return { ok: false, error: result.error }
  }
  return {
    runHostHalf: (agentId, pluginId, packageId, mode, requestId, approveFutureVersions) =>
      call('runHostHalf', { agentId, pluginId, packageId, mode, ...(requestId === null ? {} : { requestId }), approveFutureVersions }),
    getClientCode: (agentId, pluginId, pluginRunId) =>
      call('getClientCode', { agentId, pluginId, pluginRunId }),
    resolveRequestRun: (requestId, resolution) =>
      call('resolveRequestRun', { requestId, resolution }),
    settleUserRun: (agentId, pluginId, resolution) =>
      call('settleUserRun', { agentId, pluginId, resolution }),
    invoke: (pluginId, pluginRunId, method, args) =>
      call('invoke', { pluginId, pluginRunId, method, args }),
  }
}
