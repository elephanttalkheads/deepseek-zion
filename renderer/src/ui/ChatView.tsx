/**
 * M2 — chat node renderer (Q19A self-authored presentational layer).
 *
 * Renders the assembled `ChatConversationViewNode[]` (official conversation
 * definitions already turned Session events into these nodes). Kind dispatch is
 * keyed on the node's business kind; content blocks are rendered as text for
 * this milestone. Detailed per-kind surfaces (tool tree, diff, deliberation…)
 * arrive as M2/M3 polish.
 */
import type { ChatConversationViewNode } from '../../vendor/client-runtime/client/contract/conversation.ts'
import type { ToolCallBlock } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import { ToolCallCard } from './ToolCallCard.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'

interface BlockLike { type?: string; text?: string }

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
          ? `[tool: ${(b as { name?: string }).name ?? '?'}]`
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

export function ChatView({ nodes }: { nodes: readonly ChatConversationViewNode[] }): JSX.Element {
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
        return (
          <div key={node.key} className={`chat-node chat-node--${node.kind}`} data-kind={node.kind}>
            <div className="chat-node-body">{nodeBody(node)}</div>
            {isAssistant && (
              <div className="chat-node-actions" data-kind={node.kind}>
                <SlotAnchor slot="conversation.chat.assistant-actions" ownerProps={{ kind: node.kind }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
