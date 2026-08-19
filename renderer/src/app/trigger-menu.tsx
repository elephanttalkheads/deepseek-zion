/**
 * TriggerMenu — zion 侧输入触发管线(P2 `/` `@` MenuView + popupSelect)。
 *
 * 官方由 ui-input-trigger 的 cordis Service 装配(controller 挂 session scope、
 * 来源注册进 inputTriggers、MenuView 经 conversation.input.overlay 槽渲染),
 * ui-commands 提供 popupSelect 壳 + /permission 装饰。zion 不走 cordis 槽:
 * - 直用 vendored 纯类 InputTriggerController + MenuView + PopupSelectController
 *   + PopupSelectView;来源表(zion roster)在 hook 内按选中会话构建:
 *   'command'(commands.list 目录,与「+」面板同源)+ 'skill'(skill.list)。
 * - pick 语义:普通命令/技能落 `/name ` 文本(plain-text-reference 决策);
 *   /permission 是 host 命令装饰 → 打开 popupSelect(预设选项,Full access
 *   风险确认),选中后经 session.command 提交 `/permission <id>`。
 * - actx shim:controller.execute 的 bail 事件面映射为 applyOutcome(draft 改)。
 *
 * 官方 claim 装饰(输入机命令态)不在 zion 范围:命令 pick 一律文本插入。
 * 官方 '@' 触发源(子代理引用)暂无来源注册 → '@' 无菜单(官方无来源时同)。
 */
import { useEffect, useMemo, useRef } from 'react'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'
import type { SessionId } from '../../vendor/client-connection/client/api.ts'
import { InputTriggerController } from '../../vendor/ui-input-trigger/client/controller.ts'
import type {
  InputTriggerSource, PickOutcome, TokenSpan,
} from '../../vendor/ui-input-trigger/client/index.ts'
import { MenuView } from '../../vendor/ui-input-trigger/client/MenuView.tsx'
import { zh as slashZh } from '../../vendor/ui-input-trigger/client/locales.ts'
import type { MenuKey } from '../../vendor/ui-input-trigger/client/locales.ts'
import { PopupSelectController } from '../../vendor/ui-commands/client/popup.ts'
import { PopupSelectView } from '../../vendor/ui-commands/client/PopupSelectView.tsx'
import { zh as commandZh } from '../../vendor/ui-commands/client/locales.ts'
import type { CommandKey } from '../../vendor/ui-commands/client/locales.ts'
import { zh as skillZh } from '../../vendor/ui-skill/locales.ts'
import { zh as permissionZh } from '../../vendor/ui-permission-presets/client/locales.ts'
import { FULL_ACCESS_PRESET, displayPermissionPreset } from '../../vendor/ui-permission-presets/client/presentation.ts'
import type { PermissionSelect } from '@deepseek-ai/dsh-permission-presets/client'
import { useRuntime } from './runtime.tsx'
import { makeT } from './locale-common.ts'

// 等位声明(官方在 ui-input-trigger/ui-commands client index 的 apply,不在编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The trigger menu copy. */
    'slash.menu': MenuKey
    /** The popupSelect shell copy. */
    command: CommandKey
  }
}

const slashT = makeT(slashZh as Record<string, string>)
const commandT = makeT(commandZh as Record<string, string>)
const skillT = makeT(skillZh as Record<string, string>)
const permissionT = makeT(permissionZh as Record<string, string>)

/** actx 事件的 payload 形状(bail 事件的 { text/claim, span } 等)。 */
interface BailPayload {
  readonly text?: string
  readonly span?: TokenSpan
}

/**
 * 构建一个会话的来源表。onPickCommand 返回 'popup' 时调用方应已打开
 * popupSelect 且本次 pick 不应再有文本落盘(controller.execute 对
 * undefined outcome 返回 false,不改 draft)。
 */
function buildRoster(deps: {
  sessionId: SessionId
  listCommands: () => Promise<readonly CommandDescriptor[]>
  listSkills: () => Promise<readonly { name: string; description?: string; modelInvocable: boolean }[]>
  onPickCommand: (name: string, span: TokenSpan | undefined) => 'insert' | 'popup'
}): InputTriggerSource[] {
  const commands = deps.listCommands
  const skills = deps.listSkills
  return [
    {
      trigger: '/',
      name: 'command',
      order: 1,
      async candidates(_session, { query, signal }) {
        const items = await commands()
        if (signal.aborted) return []
        return items
          .filter(c => c.name.startsWith(query))
          .map(c => ({ name: c.name, description: c.description }))
      },
      warm() { void commands().catch(() => {}) },
      onPick({ candidate, span }) {
        // /permission 等带 popupSelect 装饰的命令:交给 popup 壳,不落文本。
        if (deps.onPickCommand(candidate.name, span) === 'popup') return undefined
        return { text: `/${candidate.name} ` }
      },
    },
    {
      trigger: '/',
      name: 'skill',
      order: 2,
      async candidates(_session, { query, signal }) {
        const items = await skills()
        if (signal.aborted) return []
        return items
          .filter(s => s.name.startsWith(query))
          .map(s => ({
            name: s.name,
            description: s.modelInvocable ? s.description : `${skillT('menu.userOnly')} · ${s.description}`,
          }))
      },
      warm() { void skills().catch(() => {}) },
      onPick({ candidate }) {
        return { text: `/${candidate.name} ` }
      },
    },
  ]
}

/** InputBar 需要的触发管线面。 */
export interface TriggerPipeline {
  /** 文本变化/光标移动后喂入。 */
  track(draft: string, caret: number, rev: number): void
  /** 键盘仲裁(菜单开着时返回 consumed 等)。 */
  arbitrate(key: 'up' | 'down' | 'enter' | 'escape', composing: boolean): 'consumed' | 'pick-highlighted' | 'pass'
  /** 渲染:MenuView + PopupSelectView(挂在 composer 上的锚点)。 */
  render(): JSX.Element | null
}

/**
 * 每选中会话建一条触发管线(controller + popup controller + roster)。
 * applyOutcome:pick 结果落 draft(span CAS 由调用方负责)。
 * consumeToken:popupSelect 成功结算后移除开壳时的令牌段(span CAS 同)。
 */
export function useTriggerPipeline(
  applyOutcome: (outcome: PickOutcome, span: TokenSpan) => void,
  consumeToken: (span: TokenSpan) => void,
): TriggerPipeline {
  const { wire, selectedSessionId, usePermissions, listCommands } = useRuntime()
  const applyRef = useRef(applyOutcome)
  applyRef.current = applyOutcome
  const consumeRef = useRef(consumeToken)
  consumeRef.current = consumeToken
  // 权限投影最新值(popup options 打开时读取)。
  const permissionValue = usePermissions(p => p)
  const permissionsRef = useRef<PermissionSelect | undefined>(undefined)
  permissionsRef.current = permissionValue ?? undefined

  const pipeline = useMemo(() => {
    if (selectedSessionId === undefined) return null
    const session = wire.sessions.get(selectedSessionId)
    if (session === undefined) return null

    let listSkillsCache: readonly { name: string; description?: string; modelInvocable: boolean }[] | null = null

    const popup = new PopupSelectController<{ sessionId: SessionId }>({
      consume(segment) {
        // 菜单路径:成功后移除开壳时的令牌段(官方 consume-token 事件等位)。
        if (segment.via === 'menu') consumeRef.current(segment.span)
        return true
      },
      focusComposer() { document.querySelector<HTMLTextAreaElement>('.input-bar-textarea')?.focus() },
    })

    const permissionSpec = (value: PermissionSelect): Parameters<PopupSelectController['open']>[1] => ({
      options: async () => value.options.map(option => ({
        id: option.value,
        label: displayPermissionPreset(option.value, option.name),
        ...(option.description !== undefined ? { detail: option.description } : {}),
        ...(option.value === value.currentValue ? { active: true } : {}),
        ...(option.value === FULL_ACCESS_PRESET
          ? {
            confirmation: {
              title: permissionT('confirm.title'),
              description: permissionT('confirm.description'),
              acknowledgeLabel: permissionT('confirm.acknowledge'),
              cancelLabel: permissionT('confirm.cancel'),
              confirmLabel: permissionT('confirm.enable'),
            },
          }
          : {}),
      })),
      onSelect: async (option) => {
        const res = await session.command(`/permission ${option.id}`)
        if (!res.ok) throw new Error(`permission switch failed: ${res.error.code}: ${res.error.message}`)
        if (!res.value.matched) throw new Error('the host offers no /permission command')
      },
    })

    const roster = buildRoster({
      sessionId: selectedSessionId,
      listCommands: async () => {
        // runtime.listCommands 走 wire 的 commands.list(选中会话)。
        return listCommands()
      },
      listSkills: async () => {
        if (listSkillsCache === null) {
          const res = await wire.api.skills.list({ sessionId: selectedSessionId }, new AbortController().signal)
          listSkillsCache = res.result.ok ? res.result.value.skills : []
        }
        return listSkillsCache
      },
      onPickCommand(name, span) {
        if (name !== 'permission') return 'insert'
        const value = permissionsRef.current
        if (value === undefined) return 'insert'
        if (span === undefined) return 'insert'
        popup.open('permission', permissionSpec(value), { sessionId: selectedSessionId }, { via: 'menu', span })
        return 'popup'
      },
    })

    // actx shim:execute 的 scoped 事件面 → applyOutcome。
    const actx: import('../../vendor/ui-input-trigger/client/controller.ts').TriggerActxShim = {
      bail: (_subject: unknown, _event: string, payload: unknown): boolean => {
        const p = payload as BailPayload
        if (p.text === undefined || p.span === undefined) return false
        applyRef.current({ text: p.text }, p.span)
        return true
      },
    }

    const controller = new InputTriggerController({
      actx,
      sessionId: selectedSessionId,
      roster: {
        sources: trigger => roster.filter(s => s.trigger === trigger),
        all: () => roster,
      },
    })

    return { controller, popup, roster, sessionId: selectedSessionId }
  }, [wire, selectedSessionId])

  useEffect(() => () => { pipeline?.controller.dispose() }, [pipeline])

  if (pipeline === null) {
    return {
      track() {},
      arbitrate() { return 'pass' },
      render: () => null,
    }
  }

  return {
    track(draft, caret, rev) {
      pipeline.controller.track(draft, caret, { tier: 'plain' }, rev)
    },
    arbitrate(key, composing) {
      return pipeline.controller.arbitrate(key, composing)
    },
    render() {
      // MenuView 订阅 controller.menu;PopupSelectView 订阅 popup.state。
      return (
        <div className="trigger-overlay-anchor" data-trigger-overlay>
          <MenuView
            menu={pipeline.controller.menu}
            onPick={(source, index) => { pipeline.controller.pick(source, index) }}
            onDismiss={() => { pipeline.controller.dismiss() }}
            t={slashT}
          />
          <PopupSelectView popup={pipeline.popup} t={commandT} />
        </div>
      )
    },
  }
}

/** 读权限投影(usePermissions 结果经 ref 暴露给 popup options)。 */
