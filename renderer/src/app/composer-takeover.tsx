/**
 * Composer 接管座位(官方 conversation.composer 链的 zion 直编等位)。
 *
 * 官方 ConversationRoot 用 renderSlotChain('conversation.composer', ...) 把
 * 会话语义挂起交互(approval/requested、question/requested 帧产出的 PendingWait
 * 列表)选代进 composer 座位:优先序 approval(priority 1)> question(默认 0),
 * 无挂起时回退默认 InputBar。zion 不走 cordis 槽,这里按同一选举语义直编:
 * - ApprovalPanel(vendored ui-conversation skeleton):等待审批卡。
 * - QuestionComposer(vendored ui-user-questions):普通问题流;携带 plan-review
 *   意图的问题由 QuestionComposer 内部路由到 PlanReviewPanel 决策卡。
 * 面板的应答走 PendingWait.respond → api.respond(client-response 帧);面板离场
 * 由宿主 resolved 帧驱动(会话 pending 列表清空后本座位自动回退 InputBar)。
 */
import { ApprovalPanel } from '../../vendor/client-ui-conversation/client/skeleton/ApprovalPanel.tsx'
import type { ApprovalComposerProps } from '../../vendor/client-ui-conversation/client/contract/slots.ts'
import { QuestionComposer } from '../../vendor/ui-user-questions/client/QuestionComposer.tsx'
import type { QuestionComposerProps } from '../../vendor/ui-user-questions/client/contract/slots.ts'
import { zh as conversationZh, type ConversationKey } from '../../vendor/client-ui-conversation/client/locales.ts'
import { zh as questionZh, type QuestionKey } from '../../vendor/ui-user-questions/client/locales.ts'
import { SubagentReadOnlySeat, subagentReadOnlyMatch } from './subagent.tsx'
import { InputBar } from '../ui/InputBar.tsx'
import { useRuntime } from './runtime.tsx'
import { makeT } from './locale-common.ts'

// 等位声明(官方在 ui-conversation/ui-user-questions client/index.ts 的 apply,
// 不在 zion 编译面):两个词表命名空间并入 LocaleNamespaceMap,使
// PropsLocale<'conversation'|'question'> 的键域成立。
// SlotMap 的 'conversation'/'details' 条目官方由 ui-layout 声明(zion 未 vendor,
// 但 vendored ui-conversation contract/slots.ts 的 PropsRuntime<'conversation'|'details'>
// 需要键在并集内),此处以 owner 空面等位——zion 自持布局,owner 内容无人消费。
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The conversation skeleton, chat flow, commands, details, and docks copy(等位)。 */
    conversation: ConversationKey
    /** The question composer's copy(等位)。 */
    question: QuestionKey
  }
  interface SlotMap {
    /** The whole center column(官方 ui-layout 等位;session-maybe)。 */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: object }
    /** The right details column(官方 ui-layout 等位)。 */
    'details': { kind: 'single'; scope: 'session'; owner: object }
  }
}

const conversationT = makeT(conversationZh as Record<string, string>)
const questionT = makeT(questionZh as Record<string, string>)

/** 官方选举语义:approval(priority 1)优先于 question(默认 0)。 */
function elect(
  pending: readonly import('../../vendor/client-runtime/client/index.ts').PendingInteraction[],
): import('../../vendor/client-runtime/client/index.ts').PendingInteraction | undefined {
  return pending.find(item => item.kind === 'approval')
    ?? pending.find(item => item.kind === 'question')
}

/** Composer 座位:挂起交互接管时渲染对应面板,否则回退 InputBar。 */
export function ComposerSeat(): JSX.Element {
  const { useConversation, useSessions, selectedSessionId } = useRuntime()
  const pending = useConversation(s => s.pending) ?? []
  const elected = elect(pending)
  // 只读子代理接管判定数据(官方 composer 链 priority -10 条目,挂在默认条之前):
  // one-shot 寻址子代理 / 父离线未运行的可继续子代理。钩子必须无条件调用。
  const subagent = useConversation(s => s.subagent)
  const running = useConversation(s => s.running)
  const readonly = subagentReadOnlyMatch(subagent, running)

  let body: JSX.Element
  if (elected?.kind === 'approval') {
    const props = {
      matched: elected,
      sessionId: selectedSessionId,
      useSession: useConversation,
      useSessions,
      t: conversationT,
    } as unknown as ApprovalComposerProps
    body = <ApprovalPanel {...props} />
  } else if (elected?.kind === 'question') {
    const props = {
      matched: elected,
      sessionId: selectedSessionId,
      useSession: useConversation,
      useSessions,
      t: questionT,
    } as unknown as QuestionComposerProps
    body = <QuestionComposer {...props} />
  } else if (readonly !== null) {
    body = <SubagentReadOnlySeat reason={readonly.reason} />
  } else {
    body = <InputBar />
  }

  return (
    <div className="composer-seat" data-composer-seat="">
      {body}
    </div>
  )
}
