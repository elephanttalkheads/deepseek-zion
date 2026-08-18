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

/** Minimal remote stub (SessionRemotes = { commands.execute }). M1 has no
 *  slash-command dispatch yet; called-in remote.commands.execute routes to a
 *  no-op that resolution code can extend later. */
const noopRemote = {
  commands: {
    async execute(): Promise<never> { throw new Error('remote.commands not wired in M1') },
  },
}

export interface AssembledWire {
  api: IApiClient
  isFixture: boolean
  sessions: SessionManager
  start(sinks: {
    onMux?: (e: RpcRequest<MuxFrame>) => void
    onHost?: (e: RpcRequest<HostFrame>) => void
    onConnected?: (d: HostDescription) => void
    onStateChange?: (s: 'connected' | 'reconnecting') => void
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
  const sessions = new SessionManager(api, noopRemote, undefined, undefined, conversation)

  let started = false

  return {
    api,
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
