/**
 * ConversationDock — center column.
 * M1 = hero/empty state when no session is selected. M2 = renders the selected
 * session's assembled chat nodes (user/steering/context/assistant/tool/...).
 * 会话头(面包屑标题 + chat/轨迹 视图标签)对齐官方 ConversationSessionHeader 的外形
 * 与作用域:视图切换由 zion 自持的会话级 view 状态驱动;轨迹视图渲染官方 vendor 组件。
 */
import { useEffect, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import { TrajectoryPane } from '../app/trajectory-pane.tsx'
import { JobListActionSeat } from '../app/job-list-action.tsx'
import { ChatView } from './ChatView.tsx'
import { InputBar } from './InputBar.tsx'
import { InteractionDock } from './InteractionDock.tsx'
import { QueueDock } from './QueueDock.tsx'

type ViewId = 'chat' | 'trajectory'

export function ConversationDock(): JSX.Element {
  const { wire, selectedSessionId, useSessions, useConversation } = useRuntime()
  const [view, setView] = useState<ViewId>('chat')
  const order = useConversation(s => s.chat.order)
  const nodesStore = useConversation(s => s.chat.nodes)
  const running = useConversation(s => s.running)
  const composerPhase = useConversation(s => s.composerPhase)
  const nodes = order.map(key => nodesStore.get(key)).filter((n): n is NonNullable<typeof n> => n !== undefined)
  const sessionTitle = useSessions(s => {
    if (selectedSessionId === undefined) return undefined
    return s.items.find(e => e.sessionId === selectedSessionId)?.title
  })
  useEffect(() => { setView('chat') }, [selectedSessionId])

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
      <header className="conversation-header" data-session-view={view}>
        <div className="conversation-header-title-row">
          <div className="conversation-header-title" title={sessionTitle ?? selectedSessionId}>
            {sessionTitle ?? selectedSessionId}
          </div>
          {/* 会话头动作行(官方 conversation.session.header.actions seat):后台任务 badge。 */}
          <div className="conversation-header-actions">
            <JobListActionSeat />
          </div>
        </div>
        <div className="conversation-header-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'chat'}
            className={view === 'chat' ? 'conversation-header-tab conversation-header-tab-active' : 'conversation-header-tab'}
            onClick={() => { setView('chat') }}
          >
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'trajectory'}
            className={view === 'trajectory' ? 'conversation-header-tab conversation-header-tab-active' : 'conversation-header-tab'}
            onClick={() => { setView('trajectory') }}
          >
            轨迹
          </button>
        </div>
      </header>
      {view === 'trajectory' ? (
        <TrajectoryPane sessionId={selectedSessionId} wire={wire} useConversation={useConversation} />
      ) : (
        <div className="conversation-chat">
          {nodes.length === 0 ? (
            <p className="conversation-placeholder-muted">Loading conversation…</p>
          ) : (
            <ChatView nodes={nodes} />
          )}
        </div>
      )}
      <InteractionDock />
      <QueueDock />
      {running && view === 'chat' && <div className="conversation-streaming" data-running>streaming… ({composerPhase})</div>}
      <InputBar />
    </div>
  )
}
