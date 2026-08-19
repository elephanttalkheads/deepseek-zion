/**
 * M2 — conversation definition layer.
 *
 * The official chat UI registers business node Definitions (12+ kinds) plus a
 * chat view builder into runtime registries, then hands the pair to the
 * SessionManager as its ConversationRuntime so each Session assembles nodes.
 *
 * Those registries are cordis Services (registering themselves on the owning
 * Context), so this module owns ONE "UI-logic Context" — a plain `new
 * Context()` shared with the plugin-runtime seat. This is not "turning the
 * renderer into a cordis app": the data layer stays pure-class direct; only the
 * UI business-definition layer, which the official packages are written in
 * terms of, gets a Context. It mirrors `packages/client/runtime` apply.
 */
import { Context } from '@deepseek-ai/cordis'
import { ConversationEventRegistry } from '../../vendor/client-runtime/client/conversation/event-registry.ts'
import { ConversationViewRegistry } from '../../vendor/client-runtime/client/conversation/view-registry.ts'
import { registerConversationNodes } from '../../vendor/client-ui-conversation/client/conversation-nodes/register.ts'
import { registerTrajectoryMessageDefinitions } from '../../vendor/ui-trajectory/client/trajectory-message-definitions.ts'
import { registerTrajectoryRequestHeaderDefinition } from '../../vendor/ui-trajectory/client/trajectory-request-header-definition.ts'
import { registerTrajectoryAssistantDefinition } from '../../vendor/ui-trajectory/client/trajectory-assistant-definition.ts'
import { registerTrajectoryToolDefinition } from '../../vendor/ui-trajectory/client/trajectory-tool-definition.ts'
import { registerTrajectoryCompactionDefinitions } from '../../vendor/ui-trajectory/client/trajectory-compaction-definition.ts'
import { registerTrajectoryConversationView } from '../../vendor/ui-trajectory/client/trajectory-snapshot-builder.ts'
import type { ConversationRuntime } from '../../vendor/client-runtime/client/sessions/conversation-assembler.ts'

let singleton: { conversation: ConversationRuntime; ctx: Context } | undefined

/** Build (once) the UI-logic Context with the official conversation definitions. */
export function getConversationRuntime(): { conversation: ConversationRuntime; ctx: Context } {
  if (singleton !== undefined) return singleton
  const ctx = new Context()
  // Registry constructors provide themselves on ctx (cordis Service); the
  // official register functions read ctx.conversationEvents / conversationViews.
  const conversation: ConversationRuntime = {
    events: new ConversationEventRegistry(ctx),
    views: new ConversationViewRegistry(ctx),
  }
  registerConversationNodes(ctx)
  // 轨迹视图:ui-trajectory 的各节点 Definition 与 chat 同属一条 conversation
  // Definitions 注册链(注册到 ctx.conversationViews / conversationEvents),故直接
  // 复用这里的 UI 逻辑 Context——无需 cordis slot/locale;轨迹渲染由 zion 会话头接管。
  registerTrajectoryMessageDefinitions(ctx)
  registerTrajectoryRequestHeaderDefinition(ctx)
  registerTrajectoryAssistantDefinition(ctx)
  registerTrajectoryToolDefinition(ctx)
  registerTrajectoryCompactionDefinitions(ctx)
  registerTrajectoryConversationView(ctx)
  singleton = { conversation, ctx }
  return singleton
}
