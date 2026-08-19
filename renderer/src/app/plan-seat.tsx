/**
 * PlanSeat — 官方 ui-plan PlanChip 的 zion 适配(composer 的
 * `conversation.input.plan` seat)。投影 `plan` 存在且有效目标为 plan mode 时
 * 才渲染 chip(官方语义:`pending ? !active : active`),点击经 session.command
 * 执行 `/plan off`。能力缺失(投影缺键)时整座为空,与官方一致。
 */
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import { PlanChip, type PlanChipProps } from '../../vendor/ui-plan/client/PlanModeControl.tsx'
import { zh as planZh } from '../../vendor/ui-plan/client/locales.ts'
import { useRuntime } from './runtime.tsx'

// The official `conversation.input.plan` SlotMap declaration lives in
// ui-conversation's contract/slots.ts(不在编译面);here we re-declare the
// identical entry so the vendored PlanChip's PropsRuntime compiles.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** The composer plan-mode status chip seat(官方 ui-conversation contract 等位)。 */
    'conversation.input.plan': { kind: 'single'; scope: 'session'; owner: { locked: boolean } }
  }
  /** The `plan` locale namespace(官方 ui-plan index 的字典声明,index 不在编译面)。 */
  interface LocaleNamespaceMap {
    plan: keyof typeof import('../../vendor/ui-plan/client/locales.ts').zh
  }
}

/** 官方 zh 字典投影的小型翻译器(错误文案保持英文,官方 error-surface 策略)。 */
const t = (key: string): string => (planZh as Record<string, string>)[key] ?? key

export function PlanSeat(): JSX.Element | null {
  const { usePlanProjection, useConversation, wire, selectedSessionId } = useRuntime()
  const plan = usePlanProjection(p => p) as PlanProjection | null | undefined
  const locked = useConversation(s => s.running)

  if (plan === undefined || plan === null) return null
  const target = plan.pending ? !plan.active : plan.active
  if (!target) return null

  const exitPlanMode = async (): Promise<string | null> => {
    if (selectedSessionId === undefined) return 'no session selected'
    try {
      const result = await wire.sessions.get(selectedSessionId).command('/plan off')
      if (!result.ok) return `${result.error.message} (${result.error.code})`
      if (!result.value.matched) return 'unknown command: /plan off'
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  const props = {
    // PlanChip 只请求 'plan' 一个键;闭包绑到 runtime 的 usePlanProjection。
    useProjection: () => usePlanProjection(s => s) as PlanProjection | undefined,
    locked,
    exitPlanMode,
    t,
  } as unknown as PlanChipProps
  return <PlanChip {...props} />
}
