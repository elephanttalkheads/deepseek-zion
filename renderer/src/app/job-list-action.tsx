/**
 * JobListActionSeat — 官方 ui-jobs JobListAction 的 zion 适配(会话头
 * `conversation.session.header.actions` seat)。
 *
 * 官方把它以 `conversation.session.header.actions` 槽条目注册(order 20),
 * 由 slots 运行时注入 sessionId/useSessions/t。zion 不走 cordis 槽,这里直接
 * 用 runtime 的 useSessions(jobsBySession 镜像,由 session/jobs mux 帧填充)
 * 与 job 字典补齐注入点,组件本体 1:1 来自官方 vendor。会话无 job 时组件自返
 * null(官方语义:普通会话不长出未使用能力的控件)。
 *
 * SlotMap/LocaleNamespaceMap 等位声明补齐官方 apply 未编译的 merge
 * (官方在 ui-jobs client/index.ts 与 ui-conversation contract/slots.ts)。
 */
import { JobListAction, type JobListActionProps } from '../../vendor/ui-jobs/client/JobListAction.tsx'
import { zh as jobZh } from '../../vendor/ui-jobs/client/locales.ts'
import type { JobKey } from '../../vendor/ui-jobs/client/locales.ts'
import { useRuntime } from './runtime.tsx'

// 等位声明(官方在 ui-jobs client/index.ts 的 apply 与 ui-conversation
// contract/slots.ts,均不在编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Background-job list copy(官方 NS = 'job')。 */
    job: JobKey
  }
  interface SlotMap {
    /** One button in the session header's action row(官方 contract 等位;
     *  owner 空:控件所需一切来自框架 session kit 与注册方注入面)。 */
    'conversation.session.header.actions': { kind: 'list'; scope: 'session'; owner: object }
  }
}

/** job 字典投影翻译器({count} 插值;错误文案不本地化)。 */
function makeT(dict: Record<string, string>): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    let text = dict[key] ?? key
    if (params !== undefined) {
      for (const [name, value] of Object.entries(params)) {
        text = text.replaceAll(`{${name}}`, String(value))
      }
    }
    return text
  }
}
const jobT = makeT(jobZh as Record<string, string>)

/** 会话头后台任务 badge + 弹出列表;无会话或无 jobs 时整座为空。 */
export function JobListActionSeat(): JSX.Element | null {
  const { selectedSessionId, useSessions } = useRuntime()
  if (selectedSessionId === undefined) return null
  const props = {
    sessionId: selectedSessionId,
    useSessions,
    t: jobT,
  } as unknown as JobListActionProps
  return <JobListAction {...props} />
}
