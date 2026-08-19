/**
 * SkillRowSeat — 官方 ui-skill SkillRow 的 zion 适配(工具卡 `tool.call.toolview`
 * keyed 'skill' 座)。官方由 ui-skill apply 注册 keyed 工具行;zion 不走 cordis
 * 槽,ChatView 对 toolName === 'skill' 的调用直接渲染本 seat(未占用 key 的
 * 工具仍走 ToolCallCard 通用卡)。block 来自 tool-call 节点的 root 切片。
 * LocaleNamespaceMap 等位声明补齐官方 apply 未编译的 merge。
 */
import { SkillRow } from '../../vendor/ui-skill/SkillRow.tsx'
import type { SkillKey } from '../../vendor/ui-skill/locales.ts'
import { zh as skillZh } from '../../vendor/ui-skill/locales.ts'
import type { ToolCallBlock } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import { makeT } from './locale-common.ts'

// 等位声明(官方在 ui-skill client/index.ts 的 apply,不在编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The dedicated skill tool row's copy. */
    skill: SkillKey
  }
}

const skillT = makeT(skillZh as Record<string, string>)

/** skill 工具卡(zion 无 trajectory inspect 台账 → 无 Inspect 按钮)。 */
export function SkillRowSeat({ block }: { block: ToolCallBlock }): JSX.Element {
  const props = { block, t: skillT } as unknown as Parameters<typeof SkillRow>[0]
  return <SkillRow {...props} />
}
