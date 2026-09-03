/**
 * M2 — chat node renderer (Q19A self-authored presentational layer).
 *
 * Renders the assembled `ChatConversationViewNode[]` (official conversation
 * definitions already turned Session events into these nodes). Kind dispatch is
 * keyed on the node's business kind. user 节点行动作 = 官方 vendored
 * MessageIconActions(复制 + 时钟,clock=start,保留不动);每轮底部 turn-tail =
 * 自研 ReplyActionBar(DESIGN.md §2.14:复制/好的回答/有问题的回答/分支 + meta,
 * 数据面 = vendor writeClipboard + forkSession(anchorSeq) + MessageFeedbackSeat
 * 官方 messageFeedback 契约)。
 * 消息图片 = 官方 vendored ui-attachment(ImageGallery → 点击 MessageImage →
 * ImageLightbox 原图预览;loader 走 session.readAttachment,同官方 resolveImage)。
 *
 * 风格规范(DESIGN.md 新 TUI 定稿,取代旧 ZION 块 6/11 形态):
 * - §2.6 节点前缀:user 类节点 = ❯ 话头行(100% 档前缀 + 6% 磷光薄底文本);
 *   多行续行对齐文本起点,不重复前缀。
 * - §2.9 回合不分隔:回合之间不画分隔线/雨轨,靠 ❯ 话头行与自然间距分组;
 *   每轮回复下无汇总 meta 行(信息由 §2.14 操作条 meta 承担)。
 * - §2.14 回复尾操作条:固定在每轮已结束回复底部(turn-tail)。
 * - 块 7(沿用):reasoning 块 = ThinkBlock(<details.think> 默认折叠 + 磁带纹横轨)。
 * - 块 12(沿用):流式 assistant 末文本块挂 MothCaret 字形蛾光标;interrupted
 *   assistant 末文本块挂 AbortedMark 中断乱码锁定(官方 data.status 字段)。
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
import { ContextInjectionRow } from '../../vendor/client-ui-conversation/client/chat/ContextInjectionRow.tsx'
import type { ChatConversationViewNode } from '../../vendor/client-runtime/client/contract/conversation.ts'
import type { ContextMessageNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '../../vendor/client-connection/client/api.ts'
import type { ToolCallBlock } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import { ToolCallCard } from './ToolCallCard.tsx'
import { ThinkBlock } from './ThinkBlock.tsx'
import { ReplyActionBar } from './ReplyActionBar.tsx'
import { AbortedMark, MothCaret } from './chat-fx.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { MessageFeedbackSeat } from '../app/message-feedback.tsx'

/** conversation 字典 + common 词表投影翻译器(官方 locale 查链等位)。 */
const chatT = makeT(conversationZh as Record<string, string>)

interface BlockLike { type?: string; kind?: string; text?: string; name?: string }

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

/** 消息里的图片块(user 侧 { type: 'image', attachment };assistant 侧 kind='image')。 */
function nodeImages(node: ChatConversationViewNode): { attachment: ImageAttachmentRef }[] {
  const data = node.data as Record<string, unknown>
  const blocks = node.kind === 'user' || node.kind === 'steering' || node.kind === 'context'
    ? data.content
    : data.blocks
  if (!Array.isArray(blocks)) return []
  const out: { attachment: ImageAttachmentRef }[] = []
  for (const block of blocks) {
    const b = block as { type?: string; kind?: string; attachment?: ImageAttachmentRef }
    if ((b.type === 'image' || b.kind === 'image') && b.attachment !== undefined) {
      out.push({ attachment: b.attachment })
    }
  }
  return out
}

/** 助手正文的可复制文本:仅 text 块(不含 reasoning/tool-call 标记)。 */
function assistantBlocksText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  return (blocks as BlockLike[])
    .filter(b => b.kind === 'text')
    .map(b => b.text ?? '')
    .filter(Boolean)
    .join('\n')
}


function nodeBody(node: ChatConversationViewNode): string {
  const data = node.data as Record<string, unknown>
  switch (node.kind) {
    case 'assistant':
    case 'assistant-step':
    case 'model-retry': {
      const blocks = data.blocks
      if (Array.isArray(blocks)) {
        return (blocks as BlockLike[]).map(b => (b.kind ?? b.type) === 'tool-call'
          ? `[tool: ${b.name ?? '?'}]`
          : b.text ?? (b.kind ?? b.type ?? ''))
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

/** user 类节点(user/steering/context)开启新回合。 */
function isUserKind(node: ChatConversationViewNode): boolean {
  return node.kind === 'user' || node.kind === 'steering' || node.kind === 'context'
}

/** 块 11 已废(§2.9 回合不分隔):分组保留为结构包裹——user 类节点独立成行;
 *  其间的非 user 节点收进一个 agent 回合(.turn-agent,无分隔线/雨轨)。 */
type NodeGroup =
  | { kind: 'user'; node: ChatConversationViewNode }
  | { kind: 'agent'; key: string; nodes: ChatConversationViewNode[] }

function groupNodes(nodes: readonly ChatConversationViewNode[]): NodeGroup[] {
  const groups: NodeGroup[] = []
  for (const node of nodes) {
    if (isUserKind(node)) {
      groups.push({ kind: 'user', node })
      continue
    }
    const last = groups[groups.length - 1]
    if (last !== undefined && last.kind === 'agent') last.nodes.push(node)
    else groups.push({ kind: 'agent', key: node.key, nodes: [node] })
  }
  return groups
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

  /** user 类节点:§2.6 ❯ 话头行(100% 档前缀 + 6% 磷光薄底文本);图片 gallery、
   *  user reasoning ThinkBlock、vendor MessageIconActions(clock=start)原样保留。 */
  const renderUserNode = (node: ChatConversationViewNode): JSX.Element => {
    // context 注入节点走官方 ContextInjectionRow(默认折叠的「上下文注入」行):
    // <system-reminder>/<available_skills> 等模型向文本不直接铺满会话流(2026-08-29
    // 用户裁决对齐官方——官方从来不把注入上下文渲染成 user 全文消息)。
    if (node.kind === 'context') {
      const ctx = node.data as ContextMessageNode
      return (
        <ContextInjectionRow
          key={node.key}
          content={ctx.content}
          source={ctx.source}
          provenance={ctx.provenance}
          form={ctx.form}
          t={chatT}
        />
      )
    }
    const data = node.data as { content?: unknown }
    const blocks: BlockLike[] = Array.isArray(data.content) ? (data.content as BlockLike[]) : []
    const images = nodeImages(node)
    const gallery = images.length > 0
      ? <ImageGallery images={images} load={loadImage} align="start" labels={imageLabels} />
      : null
    const time = nodeTime(node)
    // ❯ 话头行 = 全部 text/未知块(按序);reasoning 块下行挂 ThinkBlock(块 7,非流式)。
    const lineParts: JSX.Element[] = []
    const thinks: JSX.Element[] = []
    blocks.forEach((b, i) => {
      const key = `${node.key}:${i}`
      if (b.type === 'reasoning') {
        thinks.push(<ThinkBlock key={key} text={b.text ?? ''} streaming={false} />)
        return
      }
      if (b.type === 'image') return // 图片统一由 gallery 渲染
      lineParts.push(<span key={key}>{b.text ?? ''}</span>)
    })
    return (
      <div
        key={node.key}
        className={`chat-node chat-node--${node.kind} u`}
        data-kind={node.kind}
        data-time-hover-root
      >
        {lineParts.length > 0 && (
          <div className="u-line">
            <span className="psign" aria-hidden="true">❯</span>
            <span className="utext">{lineParts}</span>
          </div>
        )}
        {gallery}
        {thinks}
        <MessageIconActions
          text={userText(node)}
          time={time}
          clock="start"
          className="chat-node-actions"
          t={chatT}
        />
      </div>
    )
  }

  /** assistant/assistant-step 节点:.msg.agent 排版 + 块级渲染(reasoning→ThinkBlock,
   *  流式末文本块挂 MothCaret,interrupted 末文本块挂 AbortedMark)。 */
  const renderAssistantNode = (node: ChatConversationViewNode): JSX.Element => {
    const data = node.data as { status?: string; blocks?: unknown }
    const status = typeof data.status === 'string' ? data.status : 'settled'
    const blocks: BlockLike[] = Array.isArray(data.blocks) ? (data.blocks as BlockLike[]) : []
    let lastTextIdx = -1
    blocks.forEach((b, i) => { if (b.kind === 'text') lastTextIdx = i })
    const lastIdx = blocks.length - 1
    const images = nodeImages(node)
    const gallery = images.length > 0
      ? <ImageGallery images={images} load={loadImage} align="start" labels={imageLabels} />
      : null
    return (
      <div
        key={node.key}
        className={`chat-node chat-node--${node.kind} msg agent`}
        data-kind={node.kind}
        data-status={status}
        data-time-hover-root
      >
        {blocks.map((b, i) => {
          const key = `${node.key}:${i}`
          switch (b.kind) {
            case 'reasoning':
              // 块 7:流式且为末块时磁带纹走带 + 「· 思考中…」
              return <ThinkBlock key={key} text={b.text ?? ''} streaming={status === 'running' && i === lastIdx} />
            case 'text':
              return (
                <div key={key} className="msg-body">
                  {b.text}
                  {i === lastTextIdx && status === 'running' && i === lastIdx && <MothCaret />}
                  {i === lastTextIdx && status === 'interrupted' && <AbortedMark />}
                </div>
              )
            case 'tool-call':
              return <div key={key} className="msg-toolref">[tool: {b.name ?? '?'}]</div>
            case 'image':
              return null // 图片统一由 gallery 渲染
            default:
              return <div key={key} className="msg-body">{b.text ?? `[${b.kind ?? 'block'}]`}</div>
          }
        })}
        {gallery}
      </div>
    )
  }

  /** turn 底部 Footer(官方 TurnTailNodeView 等位):产物行 + §2.14 回复尾操作条
   *  (ReplyActionBar:复制/好的回答/有问题的回答/分支 + 用时/首 token/tok/s meta)。
   *  assistant 消息本体不再挂动作行(官方同:每轮一个 turn-tail)。 */
  const renderTurnTailNode = (node: ChatConversationViewNode): JSX.Element => {
    const data = node.data as {
      turn?: number; time?: number; ttftMs?: number; tokensPerSecond?: number;
      branchUnavailable?: boolean;
      closing?: { finalNode?: { messageId?: string }; blocks?: unknown } | null;
    }
    const location = node.location
    const turn = location.kind === 'turn' || location.kind === 'step' ? location.turn : undefined
    const runMs = turn !== undefined && turn.start !== undefined && turn.end !== undefined
      ? Math.max(0, turn.end.time - turn.start.time)
      : undefined
    const closing = data.closing ?? null
    const messageId = typeof closing?.finalNode?.messageId === 'string' ? closing.finalNode.messageId : undefined
    const deliverables = typeof data.turn === 'number'
      ? <ProducedFilesSeat timeline={timeline} turn={data.turn} seq={node.anchorSeq} />
      : null
    return (
      <div
        key={node.key}
        className="chat-node chat-node--turn-tail"
        data-kind="turn-tail"
        data-turn-tail={data.turn}
        data-time-hover-root
      >
        {deliverables}
        <ReplyActionBar
          text={closing === null ? '' : assistantBlocksText(closing.blocks)}
          time={typeof data.time === 'number' ? data.time : undefined}
          runMs={runMs}
          ttftMs={data.ttftMs}
          tokensPerSecond={data.tokensPerSecond}
          onBranch={() => { forkNode(node) }}
          branchUnavailable={data.branchUnavailable === true}
          feedback={messageId === undefined
            ? null
            : <MessageFeedbackSeat remote={wire.messageFeedback} sessionId={sessionId} messageId={messageId} />}
          t={chatT}
        />
      </div>
    )
  }

  /** agent 回合内的通用节点(工具卡/命令/compaction/turn 标记/workflow 卡等,形态不变)。 */
  const renderGenericNode = (node: ChatConversationViewNode): JSX.Element => {
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
    // workflow-run:keyed 节点整卡。
    if (node.kind === 'workflow-run') {
      return (
        <div key={node.key} className="chat-node chat-node--workflow-run" data-kind="workflow-run">
          <WorkflowRunSeat node={node} />
        </div>
      )
    }
    return (
      <div
        key={node.key}
        className={`chat-node chat-node--${node.kind}`}
        data-kind={node.kind}
      >
        <div className="chat-node-body">{nodeBody(node)}</div>
      </div>
    )
  }

  const groups = groupNodes(nodes)

  return (
    <div className="chat-view">
      {groups.map((group) => {
        if (group.kind === 'user') return renderUserNode(group.node)
        // §2.9:回合之间不画分隔线/雨轨,.turn-agent 仅为结构包裹(无编舞)。
        return (
          <div key={group.key} className="turn-agent">
            {group.nodes.map(node =>
              node.kind === 'assistant' || node.kind === 'assistant-step'
                ? renderAssistantNode(node)
                : node.kind === 'turn-tail'
                  ? renderTurnTailNode(node)
                  : renderGenericNode(node))}
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
