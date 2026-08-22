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
import type { CSSProperties } from 'react'
import type { ConversationKey } from '../../vendor/client-ui-conversation/client/locales.ts'
import type { InputZone } from '../../vendor/client-ui-conversation/client/contract/slots.ts'
import { StatsLine, contextOccupancy } from '../../vendor/client-ui-conversation/client/chat/StatsLine.tsx'
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
    'conversation.input.dock': { kind: 'list'; scope: 'session'; owner: InputZone }
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

/**
 * ctx 占用胶囊条 + 百分比(demo #mCtxbar/#mCtxPct;2026-08-21 第二轮微簇落地)。
 * 数据 = 已移除的 ContextMeter 环同一数据桥(`contextPressure` 投影 + vendor
 * `contextOccupancy` 推导):数据复活、环不复活。能力缺失(占用未知)→ 不渲染,
 * 与环同一 gate。
 */
export function ContextCapsule(): JSX.Element | null {
  const { useProjection } = useRuntime()
  const pressure = useProjection('contextPressure')
  const context = contextOccupancy(pressure)
  if (context === null) return null
  return (
    <>
      <span
        className="input-bar-ctxbar"
        style={{ '--ctx': `${context.percent}%` } as CSSProperties}
        title={`上下文占用 ${context.usedTokens} / ${context.contextWindow}`}
      >
        <i />
      </span>
      <span className="input-bar-ctxpct">{context.percent}%</span>
    </>
  )
}
