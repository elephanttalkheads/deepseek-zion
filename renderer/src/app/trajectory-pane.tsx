/**
 * TrajectoryPane — 官方 ui-trajectory 的 TrajectoryView 适配层。
 *
 * 官方把该组件以 `conversation.view` 槽条目注册(entry id='trajectory'),由 slots
 * 运行时注入 useSession/useDuration/loadOlder/setActualDuration/t。zion 不走 cordis
 * 槽,这里用 zion 已有的 useConversation(绑定会话快照)与 wire 直接补齐这几个注入点,
 * 组件本体 1:1 来自官方 vendor。
 */
import { useMemo, useState } from 'react'
import type { ComponentProps } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { TrajectoryView } from '../../vendor/ui-trajectory/client/TrajectoryView.tsx'
import { createTrajectoryDurationStore } from '../../vendor/ui-trajectory/client/duration-store.ts'
import { zh } from '../../vendor/ui-trajectory/client/locales.ts'
import type { ConversationSnapshot } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import type { AssembledWire } from '../protocol/assemble.ts'

/** 官方 zh 字典投影的小型翻译器(dict 键即官方 NS 键)。 */
const t = (key: string): string => (zh as Record<string, string>)[key] ?? key

export interface TrajectoryPaneProps {
  sessionId: SessionId
  wire: AssembledWire
  /** zion 的会话快照选择 hook(等价官方注入的 useSession)。 */
  useConversation: SnapshotSelectorHook<ConversationSnapshot>
}

/** 将官方 TrajectoryView 所需注入点逐一补齐。 */
export function TrajectoryPane({ sessionId, wire, useConversation }: TrajectoryPaneProps): JSX.Element {
  const [durationStore] = useState(() => createTrajectoryDurationStore())
  const useDuration = useMemo<SnapshotSelectorHook<boolean>>(
    () => bindSnapshotSelector<boolean>({
      getSnapshot: () => durationStore.getSnapshot(),
      subscribe: (listener) => durationStore.subscribe(listener),
    }),
    [durationStore],
  )

  const loadOlder = useMemo(() => async (): Promise<boolean> => {
    const session = wire.sessions.get(sessionId)
    if (session === undefined) return false
    const before = session.getSnapshot().views.get('trajectory')
    await session.loadOlder()
    return session.getSnapshot().views.get('trajectory') !== before
  }, [wire, sessionId])

  const setActualDuration = (value: boolean): void => { durationStore.set(value) }

  const props: ComponentProps<typeof TrajectoryView> = {
    useSession: useConversation as ComponentProps<typeof TrajectoryView>['useSession'],
    useDuration,
    loadOlder,
    setActualDuration,
    // § conversation.view 槽的子参数:zion 无 inspect 台账,给空值保持挂载点契约。
    inspect: null,
    onInspectDone: () => { /* zion 无 inspection 台账 */ },
    t,
  } as ComponentProps<typeof TrajectoryView>

  return <TrajectoryView {...props} />
}
