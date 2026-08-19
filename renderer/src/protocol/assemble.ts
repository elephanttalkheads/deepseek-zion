/**
 * M1 — B direct-assembly data layer (Q16B).
 *
 * Official client packages publish as ClientModuleSystem bundles, so this app
 * vendors their SOURCE (renderer/vendor) and compiles it directly. The pure
 * classes are assembled here WITHOUT the cordis plugin layer:
 *
 *   select api (fixture | WebApiClient, by ?fixture)  →  ConnectionController
 *   →  SessionManager → Session → ProjectionValueStore
 *   →  bindSnapshotSelector({ getSnapshot, subscribe })  →  React hooks
 *
 * Wire contract (52 RPC + respond + dual WS + session.export) is untouched:
 * we only consume it.
 */
import { ConnectionController } from '../../vendor/client-connection/client/connection.ts'
import { FixtureApiClient } from '../../vendor/client-connection/client/fixture.ts'
import { WebApiClient } from '../../vendor/client-connection/client/web-api-client.ts'
import type { HostDescription, MuxFrame, HostFrame, RpcRequest, IApiClient } from '../../vendor/client-connection/client/api.ts'
import { SessionManager } from '../../vendor/client-runtime/client/sessions/manager.ts'
import type { SessionListSnapshot } from '../../vendor/client-runtime/client/sessions/manager.ts'
import type { ConversationRuntime } from '../../vendor/client-runtime/client/sessions/conversation-assembler.ts'
import { createWebConnectionRpc } from '../../vendor/client-connection/client/rpc.ts'
import type { ClientConnectionRpc } from '../../vendor/client-connection/rpc.ts'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { CommandDescriptor, CommandExecution } from '@deepseek-ai/dsh-commands/types'

/**
 * Functional-wiring remote (M2): the Session cluster's generic `commands`
 * remote over the SAME connection RPC the api uses — fixture-in-memory when the
 * page runs ?fixture, HTTP POST /api/<endpoint> against the real backend
 * otherwise (mirrors the official `fixtureClient?.rpc ?? createWebConnectionRpc()`).
 * M1's noop stub used to throw here.
 */
function buildSessionRemote(rpc: ClientConnectionRpc) {
  return {
    commands: {
      async execute(agentId: string, line: string): Promise<RemoteResult<CommandExecution | undefined>> {
        return (await rpc.call('/api', 'commands/execute', { args: { agentId, line } })) as RemoteResult<CommandExecution | undefined>
      },
      async list(agentId: string): Promise<RemoteResult<readonly CommandDescriptor[]>> {
        return (await rpc.call('/api', 'commands/list', { args: { agentId } })) as RemoteResult<readonly CommandDescriptor[]>
      },
    },
  }
}

export interface AssembledWire {
  api: IApiClient
  /** Generic Connection RPC (fixture-in-memory when ?fixture, HTTP otherwise). */
  rpc: ClientConnectionRpc
  isFixture: boolean
  sessions: SessionManager
  start(sinks: {
    onMux?: (e: RpcRequest<MuxFrame>) => void
    onHost?: (e: RpcRequest<HostFrame>) => void
    onConnected?: (d: HostDescription) => void
    onStateChange?: (s: 'connected' | 'reconnecting') => void
    /** Forwarded host cordis events (`host/remote-event`), verbatim args. */
    onRemoteEvent?: (event: string, args: unknown[]) => void
  }): { stop(): void }
}

/** Pick api by page mode (mirrors official connection plugin pick). */
function pickApi(): { api: IApiClient; isFixture: boolean } {
  const pageLocation = typeof location === 'undefined' ? undefined : location
  const fixture = pageLocation !== undefined && new URLSearchParams(pageLocation.search).has('fixture')
  if (fixture) return { api: new FixtureApiClient(), isFixture: true }
  return { api: new WebApiClient(), isFixture: false }
}

/**
 * Assemble the M1 data layer. Sessions snapshots are produced by the pure
 * SessionManager; the caller owns React binding of its list observable.
 */
export function assembleWire(conversation?: ConversationRuntime): AssembledWire {
  const { api, isFixture } = pickApi()
  const rpc = (api as { rpc?: ClientConnectionRpc }).rpc ?? createWebConnectionRpc()
  const sessions = new SessionManager(api, buildSessionRemote(rpc), undefined, undefined, conversation)

  let started = false

  return {
    api,
    rpc,
    isFixture,
    sessions,
    start(sinks) {
      if (started) throw new Error('wire: stream loop already started once')
      started = true
      const controller = new ConnectionController(api, {
        onMuxEnvelope: (env) => {
          sessions.handleMuxEnvelope(env)
          sinks.onMux?.(env)
        },
        onHostEnvelope: (env) => {
          sessions.handleHostEnvelope(env)
          sinks.onHost?.(env)
          if (env.payload.type === 'host/remote-event') {
            sinks.onRemoteEvent?.(env.payload.event, env.payload.args)
          }
        },
        onConnected: (d) => {
          sessions.handleConnected()
          sinks.onConnected?.(d)
        },
        onStateChange: (s) => {
          if (s === 'reconnecting') sessions.handleDisconnected()
          sinks.onStateChange?.(s)
        },
      })
      controller.start()
      return { stop: () => controller.stop() }
    },
  }
}

export type { IApiClient, SessionListSnapshot }
