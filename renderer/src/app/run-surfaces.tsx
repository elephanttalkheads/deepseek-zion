/**
 * 运行面适配(ui-deliverables ProducedFiles + ui-workflow-run WorkflowRunPanel)。
 *
 * 官方把两者挂在槽面上(conversation.chat.turnTail 链 / conversation.chat.node
 * keyed 分发);zion 不走 cordis 槽,这里直接按 zion 的 ChatView 渲染位接线:
 * - ProducedFilesSeat:turn-tail 节点处读 timeline 的 turn 数据 `deliverables`
 *   (deliverablesDefinition 累积),有产物才渲染;openFile → host.openPath。
 * - WorkflowRunSeat:workflow-run 节点渲染面板;openSession → selectSession。
 * LocaleNamespaceMap/SlotMap 等位声明补齐官方 apply 未编译的 merge。
 */
import { useMemo } from 'react'
import type { ConversationTimelineSnapshot } from '../../vendor/client-runtime/client/contract/conversation.ts'
import type { ChatConversationViewNode } from '../../vendor/client-runtime/client/contract/conversation.ts'
import { producedForClosing } from '../../vendor/ui-deliverables/client/turn-deliverables.ts'
import { ProducedFiles, type ProducedFilesProps } from '../../vendor/ui-deliverables/client/ProducedFiles.tsx'
import type { DeliverablesKey } from '../../vendor/ui-deliverables/client/locales.ts'
import { zh as deliverablesZh } from '../../vendor/ui-deliverables/client/locales.ts'
import { WorkflowRunPanel, type WorkflowRunPanelProps } from '../../vendor/ui-workflow-run/client/WorkflowRunPanel.tsx'
import { zh as workflowZh } from '../../vendor/ui-workflow-run/client/locales.ts'
import type { WorkflowRunKey } from '../../vendor/ui-workflow-run/client/locales.ts'
import { useRuntime } from './runtime.tsx'
import { makeT } from './locale-common.ts'
import type { SessionId } from '../../vendor/client-connection/client/api.ts'

// 等位声明(官方在 ui-deliverables/ui-workflow-run client/index.ts 的 apply 与
// ui-conversation contract/slots.ts,均不在编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Produced-files row copy. */
    deliverables: DeliverablesKey
    /** Workflow-run panel copy. */
    workflowRun: WorkflowRunKey
  }
  interface SlotMap {
    /** Final business node renderer, keyed dispatch on the node kind(官方
     *  contract 等位;zion 只消费 workflow-run 一个入口)。 */
    'conversation.chat.node': {
      kind: 'keyed'
      scope: 'session'
      keyProps: { 'workflow-run': { node: ChatConversationViewNode } }
    }
  }
}

const deliverablesT = makeT(deliverablesZh as Record<string, string>)
const workflowT = makeT(workflowZh as Record<string, string>)

/** turn-tail 处的产物行(turn 无产物 → 不渲染,官方链 select 拒绝语义)。 */
export function ProducedFilesSeat({ timeline, turn, seq }: {
  timeline: ConversationTimelineSnapshot
  turn: number
  seq: number
}): JSX.Element | null {
  const { wire } = useRuntime()
  const paths = useMemo(() => {
    const data = timeline.turns.get(turn)?.data.get('deliverables')
    return producedForClosing(data, seq)
  }, [timeline, turn, seq])
  if (paths.length === 0) return null

  const openFile = (path: string): void => {
    void wire.api.host.openPath({ path }, new AbortController().signal)
  }
  const props = {
    matched: paths,
    openFile,
    // zion 无 loopback/hostDescription 台账:isLoopback=false → canOpenPath=false
    // (「在文件夹中显示」隐藏),chips 本身照常渲染。
    isLoopback: false,
    useHostDescription: () => undefined,
    t: deliverablesT,
  } as unknown as ProducedFilesProps
  return <ProducedFiles {...props} />
}

/** workflow-run 节点面板(openSession = 切换选中会话)。 */
export function WorkflowRunSeat({ node }: { node: ChatConversationViewNode }): JSX.Element {
  const { selectSession, selectedSessionId, useSessions } = useRuntime()
  const props = {
    node: node as unknown as WorkflowRunPanelProps['node'],
    sessionId: selectedSessionId,
    useSessions,
    openSession: (id: SessionId) => { selectSession(id) },
    t: workflowT,
  } as unknown as WorkflowRunPanelProps
  return <WorkflowRunPanel {...props} />
}
