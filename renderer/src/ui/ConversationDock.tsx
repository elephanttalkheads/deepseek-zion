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
import { AgentPresetLabelSeat, AgentPresetSeatSeat } from '../app/agent-preset.tsx'
import { SubagentCatalogActionSeat } from '../app/subagent.tsx'
import { ComposerSeat } from '../app/composer-takeover.tsx'
import { ChatView } from './ChatView.tsx'
import type { SessionId } from '../../vendor/client-connection/client/api.ts'

type ViewId = 'chat' | 'trajectory'

/** 会话层级面包屑的一段(官方 deriveAncestry 产物:祖先链各段 id + 显示标题)。 */
interface Crumb {
  id: string
  title: string
}

export function ConversationDock(): JSX.Element {
  const { wire, selectedSessionId, useSessions, useConversation, selectSession } = useRuntime()
  const [view, setView] = useState<ViewId>('chat')
  const order = useConversation(s => s.chat.order)
  const nodesStore = useConversation(s => s.chat.nodes)
  const timeline = useConversation(s => s.chat.timeline)
  const running = useConversation(s => s.running)
  const composerPhase = useConversation(s => s.composerPhase)
  const nodes = order.map(key => nodesStore.get(key)).filter((n): n is NonNullable<typeof n> => n !== undefined)
  useEffect(() => { setView('chat') }, [selectedSessionId])

  // 会话层级面包屑(官方 ConversationSession.deriveAncestry 语义:祖先链 = 自身 +
  // 沿 parentSessionId 上溯直到非 subagent 祖先;当前段不可点,点祖先段回父会话
  // → selectSession(父)→ manager.select,即官方「返回主会话」入口)。
  const ancestry = useSessions<readonly Crumb[] | undefined>(s => {
    if (selectedSessionId === undefined) return undefined
    const byId = new Map(s.items.map(e => [e.sessionId, e]))
    const chain: Crumb[] = []
    let cursor = byId.get(selectedSessionId)
    while (cursor !== undefined) {
      chain.unshift({ id: cursor.sessionId, title: cursor.title ?? cursor.sessionId })
      if (cursor.origin !== 'subagent') break
      cursor = cursor.parentSessionId === undefined ? undefined : byId.get(cursor.parentSessionId)
    }
    return chain
  })

  if (selectedSessionId === undefined) {
    return (
      <div className="conversation">
        <div className="conversation-hero">
          <h1 className="conversation-hero-title">探索未至之境</h1>
          <p className="conversation-hero-sub">预览版</p>
          {/* 官方 hero 行:工作区 chip + Agent 预设 chip(官方 conversation.hero.agentPreset seat)。 */}
          <div className="conversation-hero-row">
            <AgentPresetSeatSeat />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="conversation">
      <header className="conversation-header" data-session-view={view}>
        <div className="conversation-header-title-row">
          {ancestry !== undefined && (
            <nav className="conversation-header-crumbs" aria-label="会话层级">
              {ancestry.map((crumb, index) => {
                const last = index === ancestry.length - 1
                return (
                  <span key={crumb.id} className="conversation-header-crumb-seg">
                    {index > 0 && <span className="conversation-header-crumb-sep" aria-hidden>/</span>}
                    {last ? (
                      <span className="conversation-header-crumb conversation-header-crumb-current">{crumb.title}</span>
                    ) : (
                      <button type="button" className="conversation-header-crumb" onClick={() => { selectSession(crumb.id as SessionId) }}>
                        {crumb.title}
                      </button>
                    )}
                  </span>
                )
              })}
            </nav>
          )}
          {/* 会话头动作行(官方 conversation.session.header.actions seat):后台任务 badge + 预设标签 + 子代理目录树。 */}
          <div className="conversation-header-actions">
            <AgentPresetLabelSeat />
            <SubagentCatalogActionSeat />
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
            <ChatView nodes={nodes} sessionId={selectedSessionId} wire={wire} timeline={timeline} streaming={running} />
          )}
        </div>
      )}
      {/* QueueDock 已挪进 InputBar 的 conversation.input.dock 停靠排(2026-08-21 合并形态落地)。 */}
      {running && view === 'chat' && <div className="conversation-streaming" data-running>streaming… ({composerPhase})</div>}
      <ComposerSeat />
    </div>
  )
}