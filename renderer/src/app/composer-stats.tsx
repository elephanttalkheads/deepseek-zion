/**
 * ComposerStats — 官方 ui-conversation 信息层的 zion 适配(projection 绑定)。
 *
 * StatsLineSeat:composer dock 的会话统计条(vendor StatsLine,`sessionStats`
 * + `tokenUsage` 投影 + 会话快照回退;无数据 → 不渲染),位于输入框底部。
 *
 * 2026-08-21 输入栏合并形态落地:ContextMeterSeat(占用环)按评审裁决移除
 * (ctx 占用以微簇胶囊条为准,见 ui-change-log 2026-08-21--remove-context-meter-ring.md);
 * TodoDockSeat 由自研 Matrix 版 `src/ui/TodoDock.tsx` 替换(vendor TodoDock 零改动)。
 *
 * SlotMap/LocaleNamespaceMap 等位声明补齐官方 apply 未编译的 merge
 * (conversation.input.dock / conversation locale)。
 */
import type { ConversationKey } from '../../vendor/client-ui-conversation/client/locales.ts'
import { StatsLine } from '../../vendor/client-ui-conversation/client/chat/StatsLine.tsx'
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

/** 输入框底部会话统计条(无数据 → 不渲染)。 */
export function StatsLineSeat(): JSX.Element | null {
  const { useConversation, useProjection } = useRuntime()
  return <StatsLine useSession={useConversation} useProjection={useProjection} t={conversationT} />
}
