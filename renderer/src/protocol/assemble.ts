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
import type {
  FeedbackOutcome, MessageFeedbackItem, MessageFeedbackRemote,
} from '../app/message-feedback.tsx'

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

/** 官方 messageFeedback Remote 的 fixture 内存实现(零副作用,探针可验证 CAS 语义)。 */
function buildFixtureMessageFeedbackRemote(): MessageFeedbackRemote {
  const rows = new Map<string, MessageFeedbackItem & { sessionId: string }>()
  let seq = 0
  const key = (sessionId: string, messageId: string) => `${sessionId}\u0000${messageId}`
  const nextVersion = () => `fx-${++seq}`
  return {
    async list({ sessionId }) {
      const items = [...rows.values()].filter(i => i.sessionId === sessionId).map(i => ({ messageId: i.messageId, rating: i.rating, ...(i.note === undefined ? {} : { note: i.note }), version: i.version }))
      return { ok: true, value: { ok: true, value: { items } } }
    },
    async put({ sessionId, messageId, rating, note, ifVersion }) {
      const existing = rows.get(key(sessionId, messageId))
      const have = existing?.sessionId === sessionId
      if ((have ? existing.version : null) !== ifVersion) {
        return { ok: true, value: { ok: false, error: { code: 'version-conflict', current: have ? existing : null } } }
      }
      if (note !== undefined && note.trim().length === 0) {
        return { ok: true, value: { ok: false, error: { code: 'note-blank' } } }
      }
      const next = { sessionId, messageId, rating, version: nextVersion(), ...(note === undefined ? {} : { note }) }
      rows.set(key(sessionId, messageId), next)
      return { ok: true, value: { ok: true, value: { messageId, rating, ...(note === undefined ? {} : { note }), version: next.version } } }
    },
    async delete({ sessionId, messageId, ifVersion }) {
      const existing = rows.get(key(sessionId, messageId))
      const have = existing?.sessionId === sessionId
      if (have && existing.version !== ifVersion) {
        return { ok: true, value: { ok: false, error: { code: 'version-conflict', current: existing } } }
      }
      rows.delete(key(sessionId, messageId))
      return { ok: true, value: { ok: true, value: undefined as never } }
    },
  }
}

/** 官方 messageFeedback Remote 的 wire 面:HTTP POST /api/<endpoint>(复刻只消费契约)。 */
function buildWebMessageFeedbackRemote(rpc: ClientConnectionRpc): MessageFeedbackRemote {
  return {
    list: (payload) => rpc.call('/api', 'messageFeedback.list', payload) as Promise<RemoteResult<FeedbackOutcome<{ items: MessageFeedbackItem[] }>>>,
    put: (payload) => rpc.call('/api', 'messageFeedback.put', payload) as Promise<RemoteResult<FeedbackOutcome<MessageFeedbackItem>>>,
    delete: (payload) => rpc.call('/api', 'messageFeedback.delete', payload) as Promise<RemoteResult<FeedbackOutcome<never>>>,
  }
}

export interface AssembledWire {
  api: IApiClient
  /** Generic Connection RPC (fixture-in-memory when ?fixture, HTTP otherwise). */
  rpc: ClientConnectionRpc
  isFixture: boolean
  sessions: SessionManager
  /** 消息反馈 Remote(官方 messageFeedback 契约;fixture 内存 / real HTTP)。 */
  messageFeedback: MessageFeedbackRemote
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
  const messageFeedback = isFixture ? buildFixtureMessageFeedbackRemote() : buildWebMessageFeedbackRemote(rpc)

  let started = false

  return {
    api,
    rpc,
    isFixture,
    sessions,
    messageFeedback,
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
