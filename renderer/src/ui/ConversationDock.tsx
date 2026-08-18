/**
 * ConversationDock — center column.
 * M1 = hero/empty state when no session is selected. M2 = renders the selected
 * session's assembled chat nodes (user/steering/context/assistant/tool/...).
 */
import { useRuntime } from '../app/runtime.tsx'
import { ChatView } from './ChatView.tsx'
import { InputBar } from './InputBar.tsx'
import { InteractionDock } from './InteractionDock.tsx'
import { QueueDock } from './QueueDock.tsx'

export function ConversationDock(): JSX.Element {
  const { selectedSessionId, useConversation } = useRuntime()
  const order = useConversation(s => s.chat.order)
  const nodesStore = useConversation(s => s.chat.nodes)
  const running = useConversation(s => s.running)
  const composerPhase = useConversation(s => s.composerPhase)
  const nodes = order.map(key => nodesStore.get(key)).filter((n): n is NonNullable<typeof n> => n !== undefined)

  if (selectedSessionId === undefined) {
    return (
      <div className="conversation">
        <div className="conversation-hero">
          <h1 className="conversation-hero-title">探索未至之境</h1>
          <p className="conversation-hero-sub">预览版</p>
        </div>
      </div>
    )
  }

  return (
    <div className="conversation">
      <div className="conversation-chat">
        {nodes.length === 0 ? (
          <p className="conversation-placeholder-muted">Loading conversation…</p>
        ) : (
          <ChatView nodes={nodes} />
        )}
      </div>
      <InteractionDock />
      <QueueDock />
      {running && <div className="conversation-streaming" data-running>streaming… ({composerPhase})</div>}
      <InputBar />
    </div>
  )
}
