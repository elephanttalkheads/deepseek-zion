/**
 * ComposerStats — 官方 ui-conversation 信息层的 zion 适配(projection 绑定)。
 *
 * 1) ContextMeterSeat:composer 尾部的上下文占用环(vendor ContextMeter,
 *    `contextPressure` + `contextBreakdown` 投影;无能力 → 不渲染)。
 * 2) StatsLineSeat:composer dock 的会话统计条(vendor StatsLine,
 *    `sessionStats` + `tokenUsage` 投影 + 会话快照回退;无数据 → 不渲染)。
 * 3) TodoDockSeat:composer 上方的 plan strip(vendor TodoDock,`todos` 投影;
 *    空/缺键 → 不渲染)。
 *
 * 三个组件共用 runtime 的 useProjection(per-key uSES 绑定)与 conversation
 * 字典投影翻译器。SlotMap/LocaleNamespaceMap 等位声明补齐官方 apply 未编译
 * 的 merge(conversation.input.dock / conversation locale)。
 */
import type { ConversationKey } from '../../vendor/client-ui-conversation/client/locales.ts'
import { ContextMeter } from '../../vendor/client-ui-conversation/client/skeleton/ContextMeter.tsx'
import { StatsLine } from '../../vendor/client-ui-conversation/client/chat/StatsLine.tsx'
import { TodoDock } from '../../vendor/client-ui-conversation/client/skeleton/TodoPanel.tsx'
import { zh as conversationZh } from '../../vendor/client-ui-conversation/client/locales.ts'
import { useRuntime } from './runtime.tsx'

// 等位声明(官方在 ui-conversation apply.ts / contract/slots.ts,均不在编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The conversation skeleton, chat flow, commands, details, and docks copy. */
    conversation: ConversationKey
  }
  interface SlotMap {
    /** The composer dock list(官方 contract 等位;QueueDock/TodoDock 席位)。 */
    'conversation.input.dock': { kind: 'list'; scope: 'session'; owner: { zone?: string } }
  }
}

/** conversation 字典投影翻译器({name} 插值;错误文案不本地化)。 */
function makeT(dict: Record<string, string>): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    let text = dict[key] ?? key
    if (params !== undefined) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }
}
const conversationT = makeT(conversationZh as Record<string, string>)

/** Composer 尾部上下文占用环(能力缺失 → 不渲染)。 */
export function ContextMeterSeat(): JSX.Element | null {
  const { useProjection } = useRuntime()
  return <ContextMeter useProjection={useProjection} t={conversationT} />
}

/** Composer dock 会话统计条(无数据 → 不渲染)。 */
export function StatsLineSeat(): JSX.Element | null {
  const { useConversation, useProjection } = useRuntime()
  return <StatsLine useSession={useConversation} useProjection={useProjection} t={conversationT} />
}

/** Composer 上方 plan strip(空/缺键 → 不渲染)。 */
export function TodoDockSeat(): JSX.Element | null {
  const { useConversation, useProjection, selectedSessionId } = useRuntime()
  const props = {
    useSession: useConversation,
    sessionId: selectedSessionId,
    useProjection,
    t: conversationT,
  } as unknown as Parameters<typeof TodoDock>[0]
  return <TodoDock {...props} />
}
