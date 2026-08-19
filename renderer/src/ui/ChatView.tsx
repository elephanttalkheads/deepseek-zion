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
 * 消息图片 = 官方 vendored ui-attachment(ImageGallery → 点击 MessageImage →
 * ImageLightbox 原图预览;loader 走 session.readAttachment,同官方 resolveImage)。
 */
import { useMemo } from 'react'
import type { ImageLoader } from '../../vendor/ui-attachment/index.ts'
import { ImageGallery } from '../../vendor/ui-attachment/index.ts'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { messageImageLabels } from '../../vendor/client-ui-conversation/client/image-labels.ts'
import type { ConversationTimelineSnapshot } from '../../vendor/client-runtime/client/contract/conversation.ts'
import { ProducedFilesSeat, WorkflowRunSeat } from '../app/run-surfaces.tsx'
import { SkillRowSeat } from '../app/skill-row.tsx'
import { useRuntime } from '../app/runtime.tsx'
import type { AssembledWire } from '../protocol/assemble.ts'
import { makeT } from '../app/locale-common.ts'
import { zh as conversationZh } from '../../vendor/client-ui-conversation/client/locales.ts'
import { MessageIconActions } from '../../vendor/client-ui-conversation/client/chat/MessageIconActions.tsx'
import type { ChatConversationViewNode } from '../../vendor/client-runtime/client/contract/conversation.ts'
import type { SessionId } from '../../vendor/client-connection/client/api.ts'
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

/** 消息里的图片块({ type: 'image', attachment })。 */
function nodeImages(node: ChatConversationViewNode): { attachment: ImageAttachmentRef }[] {
  const data = node.data as Record<string, unknown>
  const blocks = node.kind === 'user' || node.kind === 'steering' || node.kind === 'context'
    ? data.content
    : data.blocks
  if (!Array.isArray(blocks)) return []
  const out: { attachment: ImageAttachmentRef }[] = []
  for (const block of blocks) {
    const b = block as { type?: string; attachment?: ImageAttachmentRef }
    if (b.type === 'image' && b.attachment !== undefined) out.push({ attachment: b.attachment })
  }
  return out
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

export function ChatView({ nodes, sessionId, wire, timeline }: {
  nodes: readonly ChatConversationViewNode[]
  sessionId: SessionId
  wire: AssembledWire
  timeline: ConversationTimelineSnapshot
}): JSX.Element {
  const { forkSession } = useRuntime()

  const forkNode = (node: ChatConversationViewNode): void => {
    void forkSession(node.anchorSeq)
  }

  // 历史图片 loader(官方 resolveImage 等位):session.readAttachment →
  // Blob URL(缺 createObjectURL 时回退 data URL)。
  const loadImage = useMemo<ImageLoader>(() => (attachment) => {
    const session = wire.sessions.get(sessionId)
    if (session === undefined) return Promise.reject(new Error(`unknown session ${sessionId}`))
    return session.readAttachment(attachment.attachmentId).then((result) => {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      if (typeof URL.createObjectURL !== 'function') {
        return `data:${result.value.attachment.mediaType};base64,${bytesToBase64(result.value.data)}`
      }
      return URL.createObjectURL(new Blob([result.value.data.buffer], { type: result.value.attachment.mediaType }))
    })
  }, [wire, sessionId])
  const imageLabels = useMemo(() => messageImageLabels(chatT), [])

  return (
    <div className="chat-view">
      {nodes.map((node) => {
        if (node.kind === 'tool-call') {
          const data = node.data as { root?: ToolCallBlock }
          const block = data.root
          // 与 ToolCallCard 同款:settled 结果节点的 name 在 block.call.name。
          const toolName = block === undefined
            ? undefined
            : (block as { kind?: string }).kind === 'tool-result'
              ? (block as { call?: { name?: string } }).call?.name
              : (block as { name?: string }).name
          // skill 专用行(官方 ui-skill keyed toolview);其余工具走通用卡 + 插件槽。
          if (toolName === 'skill' && block !== undefined) {
            return (
              <div key={node.key} className="chat-node chat-node--tool-call" data-kind={node.kind} data-tool="skill">
                <SkillRowSeat block={block} />
              </div>
            )
          }
          return (
            <div key={node.key} className="chat-node chat-node--tool-call" data-kind={node.kind} data-tool={toolName ?? ''}>
              {block !== undefined ? <ToolCallCard block={block} /> : <div className="chat-node-body">[tool]</div>}
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
        const images = nodeImages(node)
        const gallery = images.length > 0
          ? <ImageGallery images={images} load={loadImage} align={isAssistant ? 'start' : 'end'} labels={imageLabels} />
          : null
        // 产物行:turn-tail 节点处读 timeline turn 数据(deliverables 累积)。
        const deliverables = node.kind === 'turn-tail'
          ? (() => {
            const turn = (node.data as { turn?: unknown }).turn
            return typeof turn === 'number'
              ? <ProducedFilesSeat timeline={timeline} turn={turn} seq={node.anchorSeq} />
              : null
          })()
          : null
        // workflow-run:keyed 节点整卡。
        const workflow = node.kind === 'workflow-run' ? <WorkflowRunSeat node={node} /> : null
        if (workflow !== null) {
          return (
            <div key={node.key} className="chat-node chat-node--workflow-run" data-kind="workflow-run">
              {workflow}
            </div>
          )
        }
        return (
          <div
            key={node.key}
            className={`chat-node chat-node--${node.kind}`}
            data-kind={node.kind}
            data-time-hover-root
          >
            {isUser ? gallery : null}
            <div className="chat-node-body">{nodeBody(node)}</div>
            {isAssistant ? gallery : null}
            {deliverables}
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

/** Uint8Array → base64(无 createObjectURL 环境的 data URL 回退)。 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
