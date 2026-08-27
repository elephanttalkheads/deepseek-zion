/**
 * M2 — chat node renderer (Q19A self-authored presentational layer).
 *
 * Renders the assembled `ChatConversationViewNode[]` (official conversation
 * definitions already turned Session events into these nodes). Kind dispatch is
 * keyed on the node's business kind. 消息行动作 = 官方 vendored MessageIconActions
 * (复制图标 + 分支 + 运行统计;user/steering clock=start;每轮底部 turn-tail
 * clock=end + 用时/首 token/tok/s 统计 + 消息反馈入口(好的回答/有问题的回答,
 * 官方 messageFeedback 契约)),分支 fork at anchorSeq(经 runtime.forkSession
 * 真后端 fork 并选中子会话)。
 * 消息图片 = 官方 vendored ui-attachment(ImageGallery → 点击 MessageImage →
 * ImageLightbox 原图预览;loader 走 session.readAttachment,同官方 resolveImage)。
 *
 * ZION 风格化(块 6/7/11/12,数值逐字照 ui-prototype/conversation/conversation-proto.html):
 * - 块 11:节点流按回合分组——user 类(user/steering/context)节点开启新回合,
 *   其后非 user 节点直到下个 user 前为一个 agent 回合,包 .turn-agent 并挂
 *   TurnRail 凝结雨轨(活动回合走带,闭环/历史凝 ◆);分组是纯加法包裹,
 *   既有渲染/插件槽/动作语义不变。
 * - 块 6:user 类节点 = OPERATOR 头 + 右对齐 .msg.user 形态,文本入场注入解码
 *   一次(InjectDecode);assistant 侧 .msg/.msg-body 排版语言。
 * - 块 7:reasoning 块 = ThinkBlock(<details.think> 默认折叠 + 磁带纹横轨)。
 * - 块 12:流式 assistant 末文本块挂 MothCaret 字形蛾光标;interrupted
 *   assistant 末文本块挂 AbortedMark 中断乱码锁定(官方 data.status 字段)。
 */
import { useMemo, useRef } from 'react'
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
import { TurnRail } from './TurnRail.tsx'
import { ThinkBlock } from './ThinkBlock.tsx'
import { AbortedMark, InjectDecode, MothCaret } from './chat-fx.tsx'
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

/** msg-head 时钟(demo 形态 HH:MM:SS)。 */
function fmtClock(t: number): string {
  const d = new Date(t)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** user 类节点(user/steering/context)开启新回合。 */
function isUserKind(node: ChatConversationViewNode): boolean {
  return node.kind === 'user' || node.kind === 'steering' || node.kind === 'context'
}

/** 块 11 回合分组:user 类节点独立成行;其间的非 user 节点收进一个 agent 回合。 */
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

export function ChatView({ nodes, sessionId, wire, timeline, streaming }: {
  nodes: readonly ChatConversationViewNode[]
  sessionId: SessionId
  wire: AssembledWire
  timeline: ConversationTimelineSnapshot
  /** 会话 streaming/running(ConversationDock 的 useConversation(s => s.running)):最后一个 agent 回合的活动判定。 */
  streaming: boolean
}): JSX.Element {
  const { forkSession } = useRuntime()

  const forkNode = (node: ChatConversationViewNode): void => {
    void forkSession(node.anchorSeq)
  }

  // 历史判定锚:挂载时已在场的节点属历史回合(.turn-agent.historical 压平动画,
  // 基态=终态直出);挂载后新到的回合保留入场编舞,活动→闭环时 seal 仍可沉降。
  const mountKeysRef = useRef<Set<string> | null>(null)
  if (mountKeysRef.current === null) {
    mountKeysRef.current = new Set(nodes.map(n => n.key))
  }
  const mountKeys = mountKeysRef.current

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

  /** user 类节点:OPERATOR 头 + 右对齐 .msg.user 形态(块 6);动作行/图片/槽原样保留。 */
  const renderUserNode = (node: ChatConversationViewNode): JSX.Element => {
    const data = node.data as { content?: unknown }
    const blocks: BlockLike[] = Array.isArray(data.content) ? (data.content as BlockLike[]) : []
    const images = nodeImages(node)
    const gallery = images.length > 0
      ? <ImageGallery images={images} load={loadImage} align="end" labels={imageLabels} />
      : null
    const time = nodeTime(node)
    return (
      <div
        key={node.key}
        className={`chat-node chat-node--${node.kind} msg user`}
        data-kind={node.kind}
        data-time-hover-root
      >
        <div className="msg-head">
          <span>OPERATOR</span>
          {time !== undefined && <span className="m-time">{fmtClock(time)}</span>}
        </div>
        {gallery}
        <div className="msg-body">
          {blocks.map((b, i) => {
            const key = `${node.key}:${i}`
            if (b.type === 'reasoning') {
              // 块 7:user 侧 reasoning 与 assistant 走同一 ThinkBlock(非流式)
              return <ThinkBlock key={key} text={b.text ?? ''} streaming={false} />
            }
            if (b.type === 'text') return <InjectDecode key={key} text={b.text ?? ''} />
            if (b.type === 'image') return null // 图片统一由 gallery 渲染
            return <span key={key}>{b.text ?? ''}</span>
          })}
        </div>
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

  /** turn 底部 Footer(官方 TurnTailNodeView 等位):产物行 + 行动作行(复制/分支/
   *  统计/消息反馈)。assistant 消息本体不再挂动作行(官方同:每轮一个 turn-tail)。 */
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
        <MessageIconActions
          text={closing === null ? '' : assistantBlocksText(closing.blocks)}
          time={typeof data.time === 'number' ? data.time : undefined}
          runMs={runMs}
          ttftMs={data.ttftMs}
          tokensPerSecond={data.tokensPerSecond}
          clock="end"
          onBranch={() => { forkNode(node) }}
          branchUnavailable={data.branchUnavailable === true}
          className="chat-node-actions"
          t={chatT}
          extraActions={messageId === undefined
            ? null
            : <MessageFeedbackSeat remote={wire.messageFeedback} sessionId={sessionId} messageId={messageId} />}
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
  // 活动回合 = 最后一个 agent 回合且会话 streaming/running(块 11 雨轨走带判定)。
  let lastAgentIdx = -1
  groups.forEach((g, i) => { if (g.kind === 'agent') lastAgentIdx = i })

  return (
    <div className="chat-view">
      {groups.map((group, gi) => {
        if (group.kind === 'user') return renderUserNode(group.node)
        const active = gi === lastAgentIdx && streaming
        // 历史回合(挂载时已在场)压平动画;活动/本会话新闭环回合保留编舞。
        const historical = !active && group.nodes.every(n => mountKeys.has(n.key))
        return (
          <div key={group.key} className={`turn-agent${active ? ' is-active' : ''}${historical ? ' historical' : ''}`}>
            <TurnRail active={active} />
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
