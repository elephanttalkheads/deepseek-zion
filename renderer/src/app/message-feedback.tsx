/**
 * 消息反馈(官方 ui-message-feedback 的 zion 直编等位)。
 *
 * 官方把「好的回答 / 有问题的回答」入口注册进
 * `conversation.chat.assistant-actions` 槽(TurnTail 的 extraActions 区),
 * 由 ui-message-feedback 插件提供 MessageFeedbackActions;数据走 Host
 * `messageFeedback.list/put/delete` Remote 契约(逐消息 rating + 可选 note,
 * ifVersion CAS)。zion 不走 apiproxy 之外的 cordis 插件半,故直编:
 * - MessageFeedbackRemote:wire 面(assemble.ts 按 ?fixture 提供内存/HTTP 实现);
 * - MessageFeedbackController:per-session 状态机(ensure/toggle/rate/clearNote,
 *   以 observed version 比对,冲突刷新);
 * - MessageFeedbackSeat:按钮 + note 编辑器(对齐官方文案与交互语义)。
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { Tooltip } from '../../vendor/ui-primitives/index.ts'
import { IconDislikeOutline16, IconLikeOutline16 } from '../../vendor/ui-primitives/icons/index.tsx'

export type MessageFeedbackRating = 'positive' | 'negative'

/** Host sidecar row(官方 MessageFeedbackItem 等位)。 */
export interface MessageFeedbackItem {
  messageId: string
  rating: MessageFeedbackRating
  note?: string
  version: string
}

/** 业务 union(官方 success/rejected 等位)。 */
export type FeedbackOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message?: string; current?: MessageFeedbackItem | null } }

/** messageFeedback Remote 命名空间(官方 @Remote 契约:carried 双层)。 */
export interface MessageFeedbackRemote {
  list(payload: { sessionId: string }): Promise<RemoteResult<FeedbackOutcome<{ items: MessageFeedbackItem[] }>>>
  put(payload: {
    sessionId: string
    messageId: string
    rating: MessageFeedbackRating
    note?: string
    ifVersion: string | null
  }): Promise<RemoteResult<FeedbackOutcome<MessageFeedbackItem>>>
  delete(payload: { sessionId: string; messageId: string; ifVersion: string | null }): Promise<RemoteResult<FeedbackOutcome<never>>>
}

export interface MessageFeedbackView {
  status: 'cold' | 'loading' | 'ready' | 'error'
  items: ReadonlyMap<string, MessageFeedbackItem>
  error: string | null
}

const INITIAL_FEEDBACK_VIEW: MessageFeedbackView = { status: 'cold', items: new Map(), error: null }

/** 官方文案(feedback 命名空间 zh)。 */
const ZH = {
  like: '好的回答',
  likeActive: '取消标记',
  dislike: '有问题的回答',
  dislikeActive: '取消标记',
  noteOpen: '补充说明',
  notePlaceholder: '这条回答哪里好,或哪里有问题?(可选)',
  noteSave: '保存',
  noteCancel: '取消',
  noteAria: '反馈说明',
  errorLoad: '反馈加载失败',
  errorGeneric: '反馈保存失败',
} as const

/** per-session controller 注册表(ChatView 每个 turn-tail 一个 seat,共享一次 list)。 */
const registry = new Map<string, MessageFeedbackController>()

/** real 后端无 messageFeedback 契约(插件未装 → HTTP 404)时,一次探测后全局停用:
 *  ensure 短路、seat 不渲染——消除逐会话重复 404(2026-08-29 用户控制台实测三连 404)。 */
let capability: 'unknown' | 'absent' = 'unknown'

function markCapabilityAbsent(): void {
  if (capability === 'absent') return
  capability = 'absent'
  for (const controller of registry.values()) controller.republish()
}

function controllerFor(remote: MessageFeedbackRemote, sessionId: string): MessageFeedbackController {
  let controller = registry.get(sessionId)
  if (controller === undefined) {
    controller = new MessageFeedbackController(remote, sessionId)
    registry.set(sessionId, controller)
  }
  return controller
}

/** 官方 controller 的 zion 直编:ensure/toggle/rate/clearNote + 冲突刷新。 */
class MessageFeedbackController {
  private status: MessageFeedbackView['status'] = 'cold'
  private items = new Map<string, MessageFeedbackItem>()
  private error: string | null = null
  private readonly listeners = new Set<() => void>()
  private loadPromise: Promise<void> | null = null
  private opTail: Promise<void> = Promise.resolve()
  private snapshot: MessageFeedbackView = INITIAL_FEEDBACK_VIEW

  constructor(
    private readonly remote: MessageFeedbackRemote,
    private readonly sessionId: string,
  ) {}

  getSnapshot = (): MessageFeedbackView => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(): void {
    this.snapshot = { status: this.status, items: this.items, error: this.error }
    for (const listener of this.listeners) listener()
  }

  /** Load once(失败可重试;契约缺失的全局停用后短路)。 */
  async ensure(): Promise<void> {
    if (capability === 'absent') return
    if (this.status === 'ready') return
    if (this.loadPromise === null) {
      this.loadPromise = this.load().finally(() => { this.loadPromise = null })
    }
    return this.loadPromise
  }

  private async load(): Promise<void> {
    this.status = 'loading'
    this.publish()
    try {
      const carried = await this.remote.list({ sessionId: this.sessionId })
      if (!carried.ok) {
        this.status = 'error'
        this.error = ZH.errorLoad
        this.publish()
        return
      }
      const result = carried.value
      if (!result.ok) {
        this.status = 'error'
        this.error = ZH.errorLoad
        this.publish()
        return
      }
      this.items = new Map(result.value.items.map(item => [item.messageId, item]))
      this.status = 'ready'
      this.error = null
      this.publish()
    } catch (error) {
      // 契约缺失(transport HTTP 404)= 后端未装反馈插件:全局停用,不再逐会话 404。
      if (String(error).includes('HTTP 404')) {
        this.status = 'cold'
        this.error = null
        this.publish()
        markCapabilityAbsent()
        return
      }
      this.status = 'error'
      this.error = ZH.errorLoad
      this.publish()
    }
  }

  /** 能力翻转时让所有 seat 重渲染(读模块级 capability 后自行隐藏)。 */
  republish(): void {
    this.publish()
  }

  /** 同 rating 再点 = 撤回(toggle);不同 rating / 无记录 = 写入/替换。 */
  toggle(messageId: string, rating: MessageFeedbackRating): Promise<boolean> {
    return this.mutate(async () => {
      const observed = this.items.get(messageId)
      if (observed?.rating === rating) return await this.deleteCommitted(messageId, observed.version)
      return await this.putCommitted(messageId, rating, observed?.note, observed?.version ?? null)
    })
  }

  /** 写入/替换 rating;note 省略保留已存 note,显式空串删除。 */
  rate(messageId: string, rating: MessageFeedbackRating, note?: string): Promise<boolean> {
    return this.mutate(async () => {
      const observed = this.items.get(messageId)
      return await this.putCommitted(messageId, rating, note ?? observed?.note, observed?.version ?? null)
    })
  }

  /** 清 note 保留 rating;无 item 直接成功。 */
  clearNote(messageId: string): Promise<boolean> {
    return this.mutate(async () => {
      const observed = this.items.get(messageId)
      if (observed === undefined) return true
      return await this.putCommitted(messageId, observed.rating, undefined, observed.version)
    })
  }

  private async putCommitted(
    messageId: string,
    rating: MessageFeedbackRating,
    note: string | undefined,
    ifVersion: string | null,
  ): Promise<boolean> {
    const carried = await this.remote.put({
      sessionId: this.sessionId,
      messageId,
      rating,
      ...(note === undefined || note.trim().length === 0 ? {} : { note }),
      ifVersion,
    })
    const outcome = carried.ok ? carried.value : { ok: false as const, error: { code: 'transport' } }
    if (outcome.ok) {
      this.items = new Map(this.items); this.items.set(messageId, outcome.value)
      this.publish()
      return true
    }
    if (outcome.error.code === 'version-conflict') {
      const current = outcome.error.current
      if (current == null) {
        this.items = new Map(this.items); this.items.delete(messageId)
      } else {
        this.items = new Map(this.items); this.items.set(messageId, current)
      }
      this.publish()
    }
    return false
  }

  private async deleteCommitted(messageId: string, ifVersion: string | null): Promise<boolean> {
    const carried = await this.remote.delete({ sessionId: this.sessionId, messageId, ifVersion })
    const outcome = carried.ok ? carried.value : { ok: false as const, error: { code: 'transport' } }
    if (outcome.ok) {
      this.items = new Map(this.items); this.items.delete(messageId)
      this.publish()
      return true
    }
    if (outcome.error.code === 'version-conflict') {
      const current = outcome.error.current
      if (current == null) {
        this.items = new Map(this.items); this.items.delete(messageId)
      } else {
        this.items = new Map(this.items); this.items.set(messageId, current)
      }
      this.publish()
    }
    return false
  }

  /** 串行化本 session 的变更,使后一次永远和已提交版本比对。 */
  private mutate(operation: () => Promise<boolean>): Promise<boolean> {
    const next = this.opTail.then(operation, operation)
    this.opTail = next.then(() => undefined, () => undefined)
    return next
  }
}

/** TurnTail actions 行内的反馈入口(官方 MessageFeedbackActions 等位)。 */
export function MessageFeedbackSeat({ remote, sessionId, messageId }: {
  remote: MessageFeedbackRemote
  sessionId: string
  messageId: string
}): JSX.Element | null {
  const controller = useMemo(() => controllerFor(remote, sessionId), [remote, sessionId])
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const item = view.items.get(messageId)
  const rating = item?.rating
  const [noteOpen, setNoteOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // 官方延迟到首次 hover/focus 才 list;zion 简化为挂载即读(一次 list 填充整段)。
  useEffect(() => { void controller.ensure() }, [controller])

  // 后端无 messageFeedback 契约(404 一次探测后全局停用):整个入口不渲染。
  // 读模块级 capability——翻转转 absent 时 markCapabilityAbsent 会 republish 触发重渲染。
  if (capability === 'absent') return null

  const settle = (ok: boolean): void => {
    setPending(false)
    setFailure(ok ? null : ZH.errorGeneric)
  }

  const onRate = (next: MessageFeedbackRating): void => {
    setPending(true)
    setFailure(null)
    setNoteOpen(false)
    void controller.toggle(messageId, next).then(settle)
  }

  const onSaveNote = (): void => {
    const trimmed = draft.trim()
    setPending(true)
    setFailure(null)
    void controller.rate(messageId, rating ?? 'positive', trimmed).then((ok) => {
      settle(ok)
      if (ok) setNoteOpen(false)
    })
  }

  const likeLabel = rating === 'positive' ? ZH.likeActive : ZH.like
  const dislikeLabel = rating === 'negative' ? ZH.dislikeActive : ZH.dislike

  return (
    <span className="msg-feedback" data-message-id={messageId}>
      <Tooltip label={likeLabel} side="bottom">
        <button
          type="button"
          className="msg-feedback-action"
          aria-label={likeLabel}
          aria-pressed={rating === 'positive'}
          data-active={rating === 'positive' || undefined}
          disabled={pending}
          onClick={() => { onRate('positive') }}
        >
          <IconLikeOutline16 />
        </button>
      </Tooltip>
      <Tooltip label={dislikeLabel} side="bottom">
        <button
          type="button"
          className="msg-feedback-action"
          aria-label={dislikeLabel}
          aria-pressed={rating === 'negative'}
          data-active={rating === 'negative' || undefined}
          disabled={pending}
          onClick={() => { onRate('negative') }}
        >
          <IconDislikeOutline16 />
        </button>
      </Tooltip>
      {rating !== undefined && !noteOpen && (
        <button type="button" className="msg-feedback-note-open" onClick={() => { setDraft(item?.note ?? ''); setNoteOpen(true) }}>
          {item?.note === undefined ? ZH.noteOpen : item.note}
        </button>
      )}
      {rating !== undefined && noteOpen && (
        <span className="msg-feedback-note-editor">
          <textarea
            className="msg-feedback-note-input"
            aria-label={ZH.noteAria}
            placeholder={ZH.notePlaceholder}
            value={draft}
            rows={2}
            onChange={(e) => { setDraft(e.target.value) }}
          />
          <button type="button" className="msg-feedback-note-save" disabled={pending} onClick={() => { onSaveNote() }}>
            {ZH.noteSave}
          </button>
          <button type="button" className="msg-feedback-note-cancel" onClick={() => { setNoteOpen(false) }}>
            {ZH.noteCancel}
          </button>
        </span>
      )}
      {failure !== null && <span className="msg-feedback-error" role="status">{failure}</span>}
    </span>
  )
}
