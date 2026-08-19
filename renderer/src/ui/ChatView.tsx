/**
 * M2 — chat node renderer (Q19A self-authored presentational layer).
 *
 * Renders the assembled `ChatConversationViewNode[]` (official conversation
 * definitions already turned Session events into these nodes). Kind dispatch is
 * keyed on the node's business kind; content blocks are rendered as text for
 * this milestone. Detailed per-kind surfaces (tool tree, diff, deliberation…)
 * arrive as M2/M3 polish. 消息行动作(官方 MessageIconActions 对齐):复制 / 分支(fork at
 * anchorSeq;经 runtime.forkSession 真后端 fork 并选中子会话)。
 */
import { useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import type { ChatConversationViewNode } from '../../vendor/client-runtime/client/contract/conversation.ts'
import type { ToolCallBlock } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import { ToolCallCard } from './ToolCallCard.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'

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

export function ChatView({ nodes }: { nodes: readonly ChatConversationViewNode[] }): JSX.Element {
  const { forkSession } = useRuntime()
  const [note, setNote] = useState<string | null>(null)

  const copyNode = async (node: ChatConversationViewNode): Promise<void> => {
    const text = assistantText(node).trim()
    if (text === '') { setNote('无可复制的正文'); return }
    try {
      await navigator.clipboard.writeText(text)
      setNote('已复制')
    } catch {
      setNote('复制失败')
    }
  }

  const forkNode = async (node: ChatConversationViewNode): Promise<void> => {
    const ok = await forkSession(node.anchorSeq)
    setNote(ok ? '已分支到新会话' : '分支失败')
  }

  return (
    <div className="chat-view">
      {note !== null && <div className="chat-view-action-note">{note}</div>}
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
                <button className="chat-node-action" type="button" onClick={() => { void copyNode(node) }}>复制</button>
                <button className="chat-node-action" type="button" onClick={() => { void forkNode(node) }}>分支</button>
                <SlotAnchor slot="conversation.chat.assistant-actions" ownerProps={{ kind: node.kind }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
