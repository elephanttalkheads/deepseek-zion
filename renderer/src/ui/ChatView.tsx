/**
 * M2 — chat node renderer (Q19A self-authored presentational layer).
 *
 * Renders the assembled `ChatConversationViewNode[]` (official conversation
 * definitions already turned Session events into these nodes). Kind dispatch is
 * keyed on the node's business kind; content blocks are rendered as text for
 * this milestone. Detailed per-kind surfaces (tool tree, diff, deliberation…)
 * arrive as M2/M3 polish. 消息行动作 = 官方 vendored MessageIconActions(复制
 * 图标 + 分支 + hover 时间戳;user/steering clock=start,assistant clock=end),
 * 分支 fork at anchorSeq(经 runtime.forkSession 真后端 fork 并选中子会话)。
 */
import { useRuntime } from '../app/runtime.tsx'
import { makeT } from '../app/locale-common.ts'
import { zh as conversationZh } from '../../vendor/client-ui-conversation/client/locales.ts'
import { MessageIconActions } from '../../vendor/client-ui-conversation/client/chat/MessageIconActions.tsx'
import type { ChatConversationViewNode } from '../../vendor/client-runtime/client/contract/conversation.ts'
import type { ToolCallBlock } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import { ToolCallCard } from './ToolCallCard.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'

/** conversation 字典 + common 词表投影翻译器(官方 locale 查链等位)。 */
const chatT = makeT(conversationZh as Record<string, string>)

interface BlockLike { type?: string; text?: string; name?: string }

function renderContentBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content.map((block) => {
    const b = block as BlockLike
    switch (b.type) {
      case 'text': return b.text ?? ''
      case 'reasoning': return `⟪${b.text ?? ''}⟫`
      default: return b.text ?? ''
    }
  }).filter(Boolean).join('\n')
}

/** 助手消息的可复制正文:仅 text 块(不含 reasoning/tool-call 标记)。 */
function assistantText(node: ChatConversationViewNode): string {
  const data = node.data as { blocks?: unknown }
  if (!Array.isArray(data.blocks)) return ''
  return (data.blocks as BlockLike[])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .filter(Boolean)
    .join('\n')
}

function nodeBody(node: ChatConversationViewNode): string {
  const data = node.data as Record<string, unknown>
  switch (node.kind) {
    case 'user':
    case 'steering':
    case 'context': {
      const content = data.content
      return renderContentBlocks(content)
    }
    case 'assistant':
    case 'assistant-step':
    case 'model-retry': {
      const blocks = data.blocks
      if (Array.isArray(blocks)) {
        return (blocks as BlockLike[]).map(b => b.type === 'tool-call'
          ? `[tool: ${b.name ?? '?'}]`
          : b.text ?? (b.type ?? ''))
          .filter(Boolean).join('\n')
      }
      return ''
    }
    case 'tool-call':
      return `[tool: ${String(data.name ?? '?')}]${typeof data.argsRaw === 'string' && data.argsRaw ? ` ${data.argsRaw}` : ''}`
    case 'tool-result':
      return `[result] ${typeof data.isError === 'boolean' && data.isError ? '✗' : '✓'}`
    case 'command':
      return `/${String(data.name ?? data.text ?? 'command')}`
    case 'compaction':
      return `[compacted] ${String(data.text ?? '')}`
    case 'turn-error':
      return `[turn error]`
    case 'turn-max-tokens':
      return `[max tokens reached]`
    case 'turn-tail':
      return `[turn complete]`
    default:
      return `[${node.kind}]`
  }
}

/** 用户侧消息的可复制正文(content 的 text 块)。 */
function userText(node: ChatConversationViewNode): string {
  const data = node.data as { content?: unknown }
  return renderContentBlocks(data.content).trim()
}

/** 节点事件时间(host epoch ms);缺失时省略时钟。 */
function nodeTime(node: ChatConversationViewNode): number | undefined {
  const data = node.data as { time?: unknown }
  return typeof data.time === 'number' ? data.time : undefined
}

export function ChatView({ nodes }: { nodes: readonly ChatConversationViewNode[] }): JSX.Element {
  const { forkSession } = useRuntime()

  const forkNode = (node: ChatConversationViewNode): void => {
    void forkSession(node.anchorSeq)
  }

  return (
    <div className="chat-view">
      {nodes.map((node) => {
        if (node.kind === 'tool-call') {
          const data = node.data as { root?: ToolCallBlock }
          const toolName = data.root !== undefined
            ? (data.root as { name?: string }).name
            : undefined
          return (
            <div key={node.key} className="chat-node chat-node--tool-call" data-kind={node.kind} data-tool={toolName ?? ''}>
              {data.root !== undefined ? <ToolCallCard block={data.root} /> : <div className="chat-node-body">[tool]</div>}
              {toolName !== undefined && (
                <div className="chat-node-toolview" data-tool={toolName}>
                  <SlotAnchor slot="tool.call.toolview" ownerProps={{ tool: toolName, key: toolName }} />
                </div>
              )}
            </div>
          )
        }
        const isAssistant = node.kind === 'assistant' || node.kind === 'assistant-step'
        const isUser = node.kind === 'user' || node.kind === 'steering' || node.kind === 'context'
        const text = isAssistant ? assistantText(node) : userText(node)
        return (
          <div
            key={node.key}
            className={`chat-node chat-node--${node.kind}`}
            data-kind={node.kind}
            data-time-hover-root
          >
            <div className="chat-node-body">{nodeBody(node)}</div>
            {(isAssistant || isUser) && (
              <MessageIconActions
                text={text}
                time={nodeTime(node)}
                clock={isAssistant ? 'end' : 'start'}
                className="chat-node-actions"
                t={chatT}
                onBranch={isAssistant ? () => { forkNode(node) } : undefined}
                extraActions={isAssistant ? (
                  <SlotAnchor slot="conversation.chat.assistant-actions" ownerProps={{ kind: node.kind }} />
                ) : undefined}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
