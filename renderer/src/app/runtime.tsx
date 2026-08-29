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
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { assembleWire, type AssembledWire } from '../protocol/assemble.ts'
import type { SessionListSnapshot } from '../../vendor/client-runtime/client/sessions/manager.ts'
import { EMPTY_CHAT_SNAPSHOT, EMPTY_CONVERSATION_VIEWS, type ConversationSnapshot } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import type { ModelSelection, PromptContentPart, SessionModels, WorkspaceView } from '../../vendor/client-connection/client/api.ts'
import type { MuxFrame } from '../../vendor/client-connection/client/api.ts'
import { RpcId, type GoalRef, type SessionId as ChainSessionId, type WorkspaceId as ChainWorkspaceId } from '../../vendor/client-connection/client/api.ts'
import { getConversationRuntime } from './conversation.ts'
import { getPluginRuntimeHandle } from '../plugin/hub.tsx'

type SessionId = SessionListSnapshot['items'][number]['sessionId']

// 链 0.1.1-rc.2 起官方把 id 升级为品牌类型(编译期断言,零运行时成本;
// 官方 SessionId()/GoalId()/WorkspaceId() 构造即此转换)。zion 内部保持
// string 面,只在链契约边界转换。
const asSessionId = (s: string): ChainSessionId => s as ChainSessionId
const asWorkspaceId = (s: string): ChainWorkspaceId => s as ChainWorkspaceId

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

/** Shape of the `goal` session projection (the GoalService unit's whole value;
 *  mirrors the host FxGoalProjection the fixture emits under key `goal`; the
 *  real backend pushes the same structure via the `session/projection` frame). */
export interface GoalProjectionValue {
  goal: {
    id: string
    revision: number
    objective: string
    phase: 'active' | 'paused' | 'blocked' | 'complete'
    maxGoalRounds?: number
  }
  roundsStarted?: number
  createdAt?: number
  updatedAt?: number
}

/** Goal lifecycle verbs (one create + CAS-mutate per goal.* contract). */
export interface GoalActions {
  create(objective: string, maxGoalRounds?: number): Promise<boolean>
  edit(ref: { id: string; revision: number }, update: { objective?: string; maxGoalRounds?: number }): Promise<boolean>
  pause(ref: { id: string; revision: number }): Promise<boolean>
  resume(ref: { id: string; revision: number }): Promise<boolean>
  complete(ref: { id: string; revision: number }): Promise<boolean>
  clear(ref: { id: string; revision: number }): Promise<boolean>
}

export interface AppRuntime {
  wire: AssembledWire
  /** Official uSES bridge bound to sessions.list. Call as useSessions(s => s.items). */
  useSessions: SnapshotSelectorHook<SessionListSnapshot>
  /** Contract session.create; on success selects the new session. */
  createSession: () => Promise<void>
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
  /** Dispatch a slash-command line (leading /) to the selected session's agent. */
  runCommand: (line: string) => Promise<void>
  /** List the selected session's slash commands (drives the composer + menu). */
  listCommands: () => Promise<readonly import('@deepseek-ai/dsh-commands/types').CommandDescriptor[]>
  /** uSES bridge bound to the SELECTED session's `goal` projection (undefined
   *  when no goal / capability absent). Call as useGoal(g => g?.goal). */
  useGoal: SnapshotSelectorHook<GoalProjectionValue | null | undefined>
  /** uSES bridge bound to the SELECTED session's plan projection (undefined
   * when plan mode is not composed). Call as usePlanProjection(p => p). */
  usePlanProjection: SnapshotSelectorHook<import('@deepseek-ai/dsh-plan-mode/client').PlanProjection | null | undefined>
  /** uSES bridge bound to the SELECTED session's permissions projection
   * (undefined when the permission service is not composed). Call as
   * usePermissions(p => p). */
  usePermissions: SnapshotSelectorHook<import('@deepseek-ai/dsh-permission-presets/client').PermissionSelect | null | undefined>
  /** Key-addressed projection reader bound to the SELECTED session(官方第五框架席位:
   *  undefined = 能力缺失)。Call as useProjection('contextPressure') 等。 */
  useProjection: import('../../vendor/client-runtime/client/index.ts').UseProjection
  /** Goal lifecycle verbs over the goal.* contract (create/edit/pause/resume/complete/clear). */
  goalActions: GoalActions
  /** Cancel the selected session's active turn. */
  stop: () => void
  /** Apply one mutation to a still-pending queue item (remove / steer / edit). */
  updateQueue: (itemId: string, action: { kind: 'remove' } | { kind: 'steer' } | { kind: 'edit'; content: unknown[] }) => Promise<void>
  /** Fork the selected session at a turn boundary (atSeq = 锚点,见官方 forkAt)。成功则选中子会话。 */
  forkSession: (atSeq: number) => Promise<boolean>
  /** Model catalog + current selection for the SELECTED session (null while loading / no selection). */
  models: SessionModels | null
  /** Pick a model (and optional reasoning effort) for the selected session. */
  selectModel: (selection: ModelSelection) => void
  /** Deployment image intake limits (constant mirror; real backend pushes the same via 'imageLimits'). */
  imageLimits: ImageLimits
  /** Workspace rows (top-bar selector); empty until loaded. */
  workspaces: readonly WorkspaceView[]
  /** Registry-global archived session ids (from workspace.list). The sidebar
   *  filters these rows out — official ui-workspace semantics (归档后从列表消失). */
  archivedSessionIds: readonly string[]
  /** Workspace management verbs (create = host.pickDirectory → workspace.create; rename/delete). */
  workspaceActions: {
    /** Open the native directory picker, then workspace.create(path); returns the workspace or null. */
    create(): Promise<WorkspaceView | null>
    rename(workspaceId: string, title: string): Promise<boolean>
    delete(workspaceId: string): Promise<boolean>
    refresh(): void
    /** Move a workspace in the registry display order (DOM-insertBefore-like). */
    insertBefore(workspaceId: string, beforeWorkspaceId?: string): Promise<boolean>
    /** Move an accounted session within its workspace's manual order. */
    insertSessionBefore(workspaceId: string, sessionId: string, beforeSessionId?: string): Promise<boolean>
  }
  /** Session-row actions over the wire (sidebar … 菜单): rename / fork at last
   *  completed turn (selects the child) / archive. */
  sessionRowActions: {
    rename(sessionId: string, title: string): Promise<boolean>
    /** Fork at the source's last completed turn(omitted atSeq); selects the child on success. */
    fork(sessionId: string): Promise<boolean>
    archive(sessionId: string): Promise<boolean>
  }
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
  const [archivedSessionIds, setArchivedSessionIds] = useState<readonly string[]>([])

  // Workspace rows (top-bar selector + 侧栏分组账目);host 帧与显式动作后刷新。
  const reloadWorkspaces = useCallback(() => {
    const api = runtime.wire.api
    void api.workspace.list({}).then((res) => {
      if (!res.result.ok) return
      setWorkspaces(res.result.value.items)
      setArchivedSessionIds(res.result.value.archivedSessionIds ?? [])
    })
  }, [runtime])
  useEffect(() => {
    reloadWorkspaces()
  }, [reloadWorkspaces])

  // 官方对齐:当前选中会话被归档后清空选择(workspaces service 语义)。
  useEffect(() => {
    if (selectedId === undefined) return
    if (archivedSessionIds.includes(selectedId)) setSelectedId(undefined)
  }, [selectedId, archivedSessionIds])

  useEffect(() => {
    // P3-⑪:面板级 cordis 控制台走 wire 的 rpc(fixture 页 → 内存清单确定性驱动;
    // real 页 → 同一 HTTP 通道)。
    getPluginRuntimeHandle().setRpc(runtime.wire.rpc)
    const stop = runtime.wire.start({
      onConnected: () => setConnectionState('connected'),
      onStateChange: (s) => setConnectionState(s === 'reconnecting' ? 'reconnecting' : 'connected'),
      // 宿主工作区变更帧(建/改/删/归档)驱动账目刷新:分组与手动排序跟着变。
      onHost: (env) => {
        const type = env.payload.type
        // 0.1.1-rc.2 起 HostFrame 移除 host/workspace-added(新增也发 workspace-changed)。
        if (type === 'host/workspace-changed' || type === 'host/workspace-removed' || type === 'host/archived-sessions-changed') {
          reloadWorkspaces()
        }
      },
      onRemoteEvent: (event, args) => {
        // Forwarded host cordis events feed the plugin run orchestrator.
        getPluginRuntimeHandle().handleRemoteEvent(event, args)
      },
    })
    // Probe seam(fixture only):headless probes push synthetic mux frames
    //(如 `session/jobs`)直入 SessionManager 镜像,驱动 UI 形状断言。
    // rpcId 可显式传入(composer 接管探针用同一 id 同时作为信封与
    // payload.questionRpcId,使 question/requested 可被 question/resolved
    // 确定性结算;缺省随机)。
    if (runtime.wire.isFixture) {
      const win = window as unknown as Record<string, unknown>
      win.__zionProbePushMuxFrame = (frame: MuxFrame, rpcId?: string): void => {
        runtime.wire.sessions.handleMuxEnvelope({ rpcId: RpcId(rpcId ?? crypto.randomUUID()), payload: frame })
      }
    }
    return () => {
      if (runtime.wire.isFixture) {
        delete (window as unknown as Record<string, unknown>).__zionProbePushMuxFrame
      }
      stop.stop()
    }
  }, [runtime, reloadWorkspaces])

  // Probe seam(fixture only):回读当前选中会话 id。探针注入 session 级 mux 帧
  //(如 session/projection 的 goal 帧)需要目标 sessionId,而新建空白会话不进
  // 侧边栏、DOM 无处可读,故开只读缝。
  useEffect(() => {
    if (!runtime.wire.isFixture) return
    const win = window as unknown as Record<string, unknown>
    win.__zionProbeGetSelectedSessionId = (): string | undefined => selectedId
    return () => { delete win.__zionProbeGetSelectedSessionId }
  }, [runtime, selectedId])

  // Probe seam(both modes):归档过滤路径只读驱动(不触碰后端)。探针用它在真实
  // 数据上验证「归档会话从侧边栏消失」:Set 直接驱动 Sidebar 的 archivedSessionIds
  // 过滤;Get 回读当前运行时的归档集合。
  useEffect(() => {
    const winAll = window as unknown as Record<string, unknown>
    winAll.__zionProbeGetArchivedSessionIds = (): readonly string[] => archivedSessionIds
    winAll.__zionProbeSetArchivedSessionIds = (ids: readonly string[]): void => {
      setArchivedSessionIds([...ids])
    }
    winAll.__zionProbeReloadWorkspaces = (): void => reloadWorkspaces()
    return () => {
      delete winAll.__zionProbeGetArchivedSessionIds
      delete winAll.__zionProbeSetArchivedSessionIds
      delete winAll.__zionProbeReloadWorkspaces
    }
  }, [archivedSessionIds, reloadWorkspaces])

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

  // Goal projection follows the selected session the same way: bind the
  // projection store's `goal` key face (typed-unknown on the wire; the host
  // pushes whole values via the history baseline + session/projection frames).
  const useGoal = useMemo<SnapshotSelectorHook<GoalProjectionValue | null | undefined>>(() => {
    const source = (() => {
      if (selectedId === undefined) return noSessionSource as unknown as Parameters<typeof bindSnapshotSelector<GoalProjectionValue | null | undefined>>[0]
      const session = runtime.wire.sessions.get(selectedId)
      const face = session.projections.faceOf('goal') as {
        getSnapshot: () => unknown
        subscribe: (l: () => void) => () => void
      }
      return {
        getSnapshot: () => face.getSnapshot() as GoalProjectionValue | null | undefined,
        subscribe: face.subscribe,
      } as Parameters<typeof bindSnapshotSelector<GoalProjectionValue | null | undefined>>[0]
    })()
    return bindSnapshotSelector<GoalProjectionValue | null | undefined>(source)
  }, [runtime, selectedId])

  // Same projection-bound hook for the plan key (ui-plan PlanChip seat) and
  // the permissions key (composer PermissionSelect + /permission picker).
  const usePlanProjection = useMemo<SnapshotSelectorHook<import('@deepseek-ai/dsh-plan-mode/client').PlanProjection | null | undefined>>(() => {
    const source = (() => {
      if (selectedId === undefined) return noSessionSource as unknown as Parameters<typeof bindSnapshotSelector<import('@deepseek-ai/dsh-plan-mode/client').PlanProjection | null | undefined>>[0]
      const face = runtime.wire.sessions.get(selectedId).projections.faceOf('plan') as {
        getSnapshot: () => unknown
        subscribe: (l: () => void) => () => void
      }
      return {
        getSnapshot: () => face.getSnapshot() as import('@deepseek-ai/dsh-plan-mode/client').PlanProjection | null | undefined,
        subscribe: face.subscribe,
      } as Parameters<typeof bindSnapshotSelector<import('@deepseek-ai/dsh-plan-mode/client').PlanProjection | null | undefined>>[0]
    })()
    return bindSnapshotSelector<import('@deepseek-ai/dsh-plan-mode/client').PlanProjection | null | undefined>(source)
  }, [runtime, selectedId])

  const usePermissions = useMemo<SnapshotSelectorHook<import('@deepseek-ai/dsh-permission-presets/client').PermissionSelect | null | undefined>>(() => {
    const source = (() => {
      if (selectedId === undefined) return noSessionSource as unknown as Parameters<typeof bindSnapshotSelector<import('@deepseek-ai/dsh-permission-presets/client').PermissionSelect | null | undefined>>[0]
      const face = runtime.wire.sessions.get(selectedId).projections.faceOf('permissions') as {
        getSnapshot: () => unknown
        subscribe: (l: () => void) => () => void
      }
      return {
        getSnapshot: () => face.getSnapshot() as import('@deepseek-ai/dsh-permission-presets/client').PermissionSelect | null | undefined,
        subscribe: face.subscribe,
      } as Parameters<typeof bindSnapshotSelector<import('@deepseek-ai/dsh-permission-presets/client').PermissionSelect | null | undefined>>[0]
    })()
    return bindSnapshotSelector<import('@deepseek-ai/dsh-permission-presets/client').PermissionSelect | null | undefined>(source)
  }, [runtime, selectedId])

  // Generic key-addressed projection reader(官方 UseProjection 语义):per-key
  // uSES 绑定到选中会话的 ProjectionValueStore;无会话或键缺失 → undefined。
  const useProjection = useMemo<import('../../vendor/client-runtime/client/index.ts').UseProjection>(() => {
    const fn = (key: string): unknown => {
      return useSyncExternalStore(
        (onChange) => {
          if (selectedId === undefined) return () => {}
          return runtime.wire.sessions.get(selectedId).projections.faceOf(key).subscribe(onChange)
        },
        () => {
          if (selectedId === undefined) return undefined
          return runtime.wire.sessions.get(selectedId).projections.faceOf(key).getSnapshot()
        },
      )
    }
    return fn as unknown as import('../../vendor/client-runtime/client/index.ts').UseProjection
  }, [runtime, selectedId])

  const value = useMemo<AppRuntime>(() => {
    const wire = runtime.wire
    return {
      wire,
      useSessions,
      async createSession() {
        const res = await wire.sessions.create()
        if (res.ok) {
          wire.sessions.select(res.value.sessionId)
          setSelectedId(res.value.sessionId)
        }
      },
      useConversation,
      useGoal,
      usePlanProjection,
      usePermissions,
      useProjection,
      goalActions: {
        create: (objective, maxGoalRounds) => {
          if (selectedId === undefined) return Promise.resolve(false)
          return wire.api.goals.create({ sessionId: asSessionId(selectedId), objective, ...(maxGoalRounds === undefined ? {} : { maxGoalRounds }) })
            .then(res => res.result.ok)
        },
        edit: (ref, update) => {
          if (selectedId === undefined) return Promise.resolve(false)
          return wire.api.goals.edit({ sessionId: asSessionId(selectedId), ref: ref as GoalRef, ...update }).then(res => res.result.ok)
        },
        pause: (ref) => {
          if (selectedId === undefined) return Promise.resolve(false)
          return wire.api.goals.pause({ sessionId: asSessionId(selectedId), ref: ref as GoalRef }).then(res => res.result.ok)
        },
        resume: (ref) => {
          if (selectedId === undefined) return Promise.resolve(false)
          return wire.api.goals.resume({ sessionId: asSessionId(selectedId), ref: ref as GoalRef }).then(res => res.result.ok)
        },
        complete: (ref) => {
          if (selectedId === undefined) return Promise.resolve(false)
          return wire.api.goals.complete({ sessionId: asSessionId(selectedId), ref: ref as GoalRef }).then(res => res.result.ok)
        },
        clear: (ref) => {
          if (selectedId === undefined) return Promise.resolve(false)
          return wire.api.goals.clear({ sessionId: asSessionId(selectedId), ref: ref as GoalRef }).then(res => res.result.ok)
        },
      },
      connectionState,
      isFixture: runtime.isFixture,
      selectSession(sessionId) {
        wire.sessions.select(sessionId)
        setSelectedId(sessionId)
      },
      selectedSessionId: selectedId,
      sendPrompt(parts) {
        if (selectedId === undefined) return
        const session = wire.sessions.get(selectedId)
        void session.prompt(parts, 'queue')
      },
      async runCommand(line) {
        if (selectedId === undefined) return
        const session = wire.sessions.get(selectedId)
        await session.command(line)
      },
      async listCommands() {
        if (selectedId === undefined) return []
        const result = await wire.rpc.call('/api', 'commands/list', { args: { agentId: selectedId } })
        if (!result.ok) return []
        return result.value as readonly import('@deepseek-ai/dsh-commands/types').CommandDescriptor[]
      },
      stop() {
        if (selectedId === undefined) return
        const session = wire.sessions.get(selectedId)
        void session.cancel()
      },
      async updateQueue(itemId, action) {
        if (selectedId === undefined) return
        const session = wire.sessions.get(selectedId)
        await session.updateQueue(itemId as never, action as never)
      },
      async forkSession(atSeq) {
        if (selectedId === undefined) return false
        const api = wire.api
        const res = await api.sessions.fork({ sessionId: selectedId, atSeq })
        if (!res.result.ok) return false
        const child = res.result.value.sessionId
        // The host/session-added frame can land after the RPC response; select
        // throws on unknown summaries, so retry until the manager knows the child.
        const deadline = Date.now() + 3000
        while (true) {
          try {
            wire.sessions.select(child)
            setSelectedId(child)
            return true
          } catch {
            if (Date.now() > deadline) return false
            await new Promise(r => setTimeout(r, 40))
          }
        }
      },
      models,
      selectModel(selection) {
        if (selectedId === undefined) return
        const api = wire.api
        void api.sessions.selectModel({ sessionId: selectedId, ...selection }).then(async (res) => {
          if (!res.result.ok) return
          const fresh = await api.sessions.models({ sessionId: selectedId })
          if (fresh.result.ok) setModels(fresh.result.value)
        })
      },
      imageLimits: FIXTURE_IMAGE_LIMITS,
      workspaces,
      archivedSessionIds,
      workspaceActions: {
        create: async () => {
          const picked = await wire.api.host.pickDirectory({}, new AbortController().signal)
          if (!picked.result.ok) return null
          const path = picked.result.value.path
          if (path === null) return null
          const created = await wire.api.workspace.create({ path })
          if (!created.result.ok) return null
          await reloadWorkspaces()
          return created.result.value.workspace
        },
        rename: async (workspaceId, title) => {
          const res = await wire.api.workspace.rename({ workspaceId: asWorkspaceId(workspaceId), title })
          if (res.result.ok) await reloadWorkspaces()
          return res.result.ok
        },
        delete: async (workspaceId) => {
          const res = await wire.api.workspace.delete({ workspaceId: asWorkspaceId(workspaceId) })
          if (res.result.ok) await reloadWorkspaces()
          return res.result.ok
        },
        refresh: () => reloadWorkspaces(),
        insertBefore: async (workspaceId, beforeWorkspaceId) => {
          const res = await wire.api.workspace.insertBefore({
            workspaceId: asWorkspaceId(workspaceId),
            ...(beforeWorkspaceId === undefined ? {} : { beforeWorkspaceId: asWorkspaceId(beforeWorkspaceId) }),
          })
          if (res.result.ok) await reloadWorkspaces()
          return res.result.ok
        },
        insertSessionBefore: async (workspaceId, sessionId, beforeSessionId) => {
          const res = await wire.api.workspace.insertSessionBefore({
            workspaceId: asWorkspaceId(workspaceId),
            sessionId: asSessionId(sessionId),
            ...(beforeSessionId === undefined ? {} : { beforeSessionId: asSessionId(beforeSessionId) }),
          })
          if (res.result.ok) await reloadWorkspaces()
          return res.result.ok
        },
      },
      sessionRowActions: {
        rename: (sessionId, title) =>
          wire.api.sessions.rename({ sessionId: asSessionId(sessionId), title }).then(res => res.result.ok),
        fork: async (sessionId) => {
          const res = await wire.api.sessions.fork({ sessionId: asSessionId(sessionId) })
          if (!res.result.ok) return false
          const child = res.result.value.sessionId
          // The host/session-added frame can land after the RPC response; select
          // throws on unknown summaries, so retry until the manager knows the child.
          const deadline = Date.now() + 3000
          while (true) {
            try {
              wire.sessions.select(child)
              setSelectedId(child)
              return true
            } catch {
              if (Date.now() > deadline) return false
              await new Promise(r => setTimeout(r, 40))
            }
          }
        },
        archive: async (sessionId) => {
          const res = await wire.api.workspace.archiveSession({ sessionId: asSessionId(sessionId) })
          if (res.result.ok) await reloadWorkspaces()
          return res.result.ok
        },
      },
    }
  }, [runtime, useSessions, useConversation, useGoal, usePlanProjection, usePermissions, useProjection, connectionState, selectedId, models, workspaces, archivedSessionIds, reloadWorkspaces])

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
}
