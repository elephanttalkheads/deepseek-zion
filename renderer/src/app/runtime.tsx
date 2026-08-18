/**
 * React binding for the replica data layer (Q16B/Q19A) + M2 conversation seam.
 *
 * The wire exposes pure-class Observables ({ getSnapshot, subscribe }); we bind
 * them into hooks with the OFFICIAL bindSnapshotSelector — the same uSES bridge
 * the official renderer uses. The reply assembler (SessionManager) is pumped
 * from the ConnectionController sinks.
 *
 * M2 adds the conversation hook: selecting a session lazily instantiates it via
 * the manager, opens its history window, and binds its ConversationSnapshot
 * into a useConversation selector hook.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { assembleWire, type AssembledWire } from '../protocol/assemble.ts'
import type { SessionListSnapshot } from '../../vendor/client-runtime/client/sessions/manager.ts'
import { EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, type ConversationSnapshot } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import type { ModelSelection, PromptContentPart, SessionModels, WorkspaceView } from '../../vendor/client-connection/client/api.ts'
import { getConversationRuntime } from './conversation.ts'
import { getPluginRuntimeHandle } from '../plugin/hub.tsx'

type SessionId = SessionListSnapshot['items'][number]['sessionId']

/** Deployment image intake bytes (wire ImageMediaType narrowing for prompt parts). */
export type MediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Mirror of the deployment attachment/image intake limits (fixture projection 'imageLimits'). */
export interface ImageLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  mediaTypes: readonly MediaType[]
}
export const FIXTURE_IMAGE_LIMITS: ImageLimits = {
  maxImageBytes: 5 * 1024 * 1024,
  maxImagesPerMessage: 20,
  maxMessageImageBytes: 100 * 1024 * 1024,
  maxImagePixels: 40_000_000,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

export interface AppRuntime {
  wire: AssembledWire
  /** Official uSES bridge bound to sessions.list. Call as useSessions(s => s.items). */
  useSessions: SnapshotSelectorHook<SessionListSnapshot>
  /** uSES bridge bound to the SELECTED session's conversation snapshot. When no
   *  session is selected it remains stable and reports the untouched snapshot.
   *  Call as useConversation(s => s.chat.nodes.values()). */
  useConversation: SnapshotSelectorHook<ConversationSnapshot>
  /** Connection coarse state; 'connecting' before the first settled generation. */
  connectionState: 'connecting' | 'connected' | 'reconnecting'
  isFixture: boolean
  selectSession: (sessionId: SessionId) => void
  selectedSessionId: SessionId | undefined
  /** Send prompt content (text + optional image parts) to the selected session (queue mode). */
  sendPrompt: (parts: PromptContentPart[]) => void
  /** Cancel the selected session's active turn. */
  stop: () => void
  /** Model catalog + current selection for the SELECTED session (null while loading / no selection). */
  models: SessionModels | null
  /** Pick a model (and optional reasoning effort) for the selected session. */
  selectModel: (selection: ModelSelection) => void
  /** Deployment image intake limits (constant mirror; real backend pushes the same via 'imageLimits'). */
  imageLimits: ImageLimits
  /** Workspace rows (top-bar selector); empty until loaded. */
  workspaces: readonly WorkspaceView[]
}

const RuntimeContext = createContext<AppRuntime | null>(null)

export function useRuntime(): AppRuntime {
  const runtime = useContext(RuntimeContext)
  if (runtime === null) throw new Error('useRuntime: missing AppRuntime provider')
  return runtime
}

/** Establish the wire + conversation definitions once per app mount. */
export function createAppRuntime() {
  const { conversation } = getConversationRuntime()
  const wire = assembleWire(conversation)
  return { wire, isFixture: wire.isFixture }
}

/** Stable, VALID empty conversation snapshot used while no session is selected
 *  (so `s.chat` etc. never dereference undefined). */
const emptySnapshot: ConversationSnapshot = {
  sessionId: '' as SessionId,
  views: EMPTY_CONVERSATION_VIEWS,
  chat: EMPTY_CHAT_SNAPSHOT,
  nodes: [],
  turnTimings: new Map(),
  turnEnds: new Map(),
  partial: null,
  runningCalls: [],
  pending: [],
  queue: [],
  running: false,
  subagent: null,
  composerPhase: 'blank',
  removed: false,
  openState: 'cold',
  openError: null,
  hasMore: false,
  loadingOlder: false,
  promptError: null,
  blank: true,
  lastAgentError: null,
}
const noSessionSource = {
  getSnapshot: (): ConversationSnapshot => emptySnapshot,
  subscribe: () => () => {},
}

export function RuntimeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [runtime] = useState(() => createAppRuntime())
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting')
  const [selectedId, setSelectedId] = useState<SessionId | undefined>(undefined)
  const [models, setModels] = useState<SessionModels | null>(null)
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceView[]>([])

  useEffect(() => {
    const stop = runtime.wire.start({
      onConnected: () => setConnectionState('connected'),
      onStateChange: (s) => setConnectionState(s === 'reconnecting' ? 'reconnecting' : 'connected'),
      onRemoteEvent: (event, args) => {
        // Forwarded host cordis events feed the plugin run orchestrator.
        getPluginRuntimeHandle().handleRemoteEvent(event, args)
      },
    })
    return stop.stop
  }, [runtime])

  // Model catalog + current selection follows the selected session.
  useEffect(() => {
    if (selectedId === undefined) { setModels(null); return }
    let cancelled = false
    const api = runtime.wire.api
    void api.sessions.models({ sessionId: selectedId }).then((res) => {
      if (cancelled) return
      setModels(res.result.ok ? res.result.value : null)
    })
    return () => { cancelled = true }
  }, [runtime, selectedId])

  // Workspace rows (top-bar selector); fixtures serve a single workspace.
  useEffect(() => {
    let cancelled = false
    void runtime.wire.api.workspace.list({}).then((res) => {
      if (cancelled) return
      setWorkspaces(res.result.ok ? res.result.value.items : [])
    })
    return () => { cancelled = true }
  }, [runtime])

  const useSessions = useMemo(
    () => bindSnapshotSelector<SessionListSnapshot>({
      getSnapshot: () => runtime.wire.sessions.getListSnapshot(),
      subscribe: (listener) => runtime.wire.sessions.subscribe(listener),
    }),
    [runtime],
  )

  // Conversation source follows the selected session. When selection changes
  // we instantiate (if needed), open its history window, then bind its
  // snapshot; when nothing is selected we keep a stable empty source.
  const useConversation = useMemo<SnapshotSelectorHook<ConversationSnapshot>>(() => {
    const source = (() => {
      if (selectedId === undefined) return noSessionSource as Parameters<typeof bindSnapshotSelector<ConversationSnapshot>>[0]
      const manager = runtime.wire.sessions
      const session = manager.get(selectedId)
      void session.open()
      const src = {
        getSnapshot: () => session.getSnapshot(),
        subscribe: (listener: () => void) => session.subscribe(listener),
      }
      return src as Parameters<typeof bindSnapshotSelector<ConversationSnapshot>>[0]
    })()
    return bindSnapshotSelector<ConversationSnapshot>(source)
  }, [runtime, selectedId])

  const value = useMemo<AppRuntime>(() => ({
    wire: runtime.wire,
    useSessions,
    useConversation,
    connectionState,
    isFixture: runtime.isFixture,
    selectSession(sessionId) {
      runtime.wire.sessions.select(sessionId)
      setSelectedId(sessionId)
    },
    selectedSessionId: selectedId,
    sendPrompt(parts) {
      if (selectedId === undefined) return
      const session = runtime.wire.sessions.get(selectedId)
      void session.prompt(parts, 'queue')
    },
    stop() {
      if (selectedId === undefined) return
      const session = runtime.wire.sessions.get(selectedId)
      void session.cancel()
    },
    models,
    selectModel(selection) {
      if (selectedId === undefined) return
      const api = runtime.wire.api
      void api.sessions.selectModel({ sessionId: selectedId, ...selection }).then(async (res) => {
        if (!res.result.ok) return
        const fresh = await api.sessions.models({ sessionId: selectedId })
        if (fresh.result.ok) setModels(fresh.result.value)
      })
    },
    imageLimits: FIXTURE_IMAGE_LIMITS,
    workspaces,
  }), [runtime, useSessions, useConversation, connectionState, selectedId, models, workspaces])

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
}
