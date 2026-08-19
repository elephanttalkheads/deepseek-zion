/**
 * 子代理目录树 + 只读 composer(ui-subagent)zion 直编适配。
 *
 * 官方注册两面:
 * - SubagentCatalogAction → 会话头子代理目录树(conversation.session.header.actions
 *   的 subagent-catalog 条目;目录来自 sessions 快照 subagentsByParent,零 RPC
 *   候选;树行展开/打开子会话/刷新/计时与 token 度量)。
 * - SubagentReadOnlyComposer → composer 链 priority -10 的只读接管:被寻址的
 *   one-shot 子代理记录或父离线(且未运行)的可继续子代理,替换默认输入条。
 * zion 不走 cordis 槽:注入面直连 manager(refreshSubagents/setSubagentCatalogOpen/
 * select);只读判定在 ComposerSeat 链选举中(approval > question > 只读 > InputBar)。
 */
import type { SubagentAddress } from '../../vendor/client-runtime/client/index.ts'
import { SubagentCatalogAction, type SubagentCatalogActionProps, type SubagentCatalogInjected } from '../../vendor/ui-subagent/client/SubagentCatalogAction.tsx'
import { SubagentReadOnlyComposer, type SubagentReadOnlyComposerProps } from '../../vendor/ui-subagent/client/SubagentReadOnlyComposer.tsx'
import { zh as subagentZh, type SubagentKey } from '../../vendor/ui-subagent/client/locales.ts'
import { useRuntime } from './runtime.tsx'
import { makeT } from './locale-common.ts'

// 等位声明(官方在 ui-subagent client/index.ts 的 apply,不在 zion 编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Subagent catalog and read-only composer copy(官方 NS = 'subagent')。 */
    subagent: SubagentKey
  }
}

const subagentT = makeT(subagentZh as Record<string, string>)

/** 会话头子代理目录树(官方 order 10 的 subagent-catalog 条目)。 */
export function SubagentCatalogActionSeat(): JSX.Element | null {
  const { wire, useSessions, selectedSessionId, selectSession } = useRuntime()
  if (selectedSessionId === undefined) return null
  const injected: SubagentCatalogInjected = {
    // 打开子会话 = 选中(manager select + React 选择态同步,只读 composer 随快照接管)。
    openChild: (address: SubagentAddress) => { selectSession(address.childSessionId) },
    refresh: (parentSessionId) => { void wire.sessions.refreshSubagents(parentSessionId) },
    setCatalogOpen: (parentSessionId, open) => { wire.sessions.setSubagentCatalogOpen(parentSessionId, open) },
  }
  const props = {
    sessionId: selectedSessionId,
    useSessions,
    ...injected,
    t: subagentT,
  } as unknown as SubagentCatalogActionProps
  return <SubagentCatalogAction {...props} />
}

/** 会话快照的 subagent 面(ConverseSnapshot.subagent)。 */
export interface SubagentSnapshotFace {
  address: { mode: 'one-shot' | 'continuable' }
  parentAvailable: boolean
}

/**
 * 只读接管判定(官方 selectReadOnlySubagent 同款语义):
 * one-shot 寻址子代理恒只读;可继续子代理仅在父离线且未运行时只读
 * (运行中保留默认 composer 的 Stop)。
 */
export function subagentReadOnlyMatch(
  subagent: SubagentSnapshotFace | null,
  running: boolean,
): { reason: 'one-shot' | 'parent-unavailable' } | null {
  if (subagent === null) return null
  if (subagent.address.mode === 'one-shot') return { reason: 'one-shot' }
  if (subagent.parentAvailable) return null
  return running ? null : { reason: 'parent-unavailable' }
}

/** 只读 composer 替换面(挂起交互优先于它;无挂起且命中时替换 InputBar)。 */
export function SubagentReadOnlySeat({ reason }: { reason: 'one-shot' | 'parent-unavailable' }): JSX.Element {
  const props = { matched: { reason }, t: subagentT } as unknown as SubagentReadOnlyComposerProps
  return <SubagentReadOnlyComposer {...props} />
}
