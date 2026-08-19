/**
 * Agent 预设四表面(ui-agent-preset)zion 直编适配。
 *
 * 官方以四个槽面注册同一 roster(一份 list 数据,四处消费):
 * - AgentPresetRow → 设置·通用区行(默认预设选择,settings.update 写 agent-presets 命名空间)
 * - AgentPresetSeat → 新会话屏(无会话 hero)预设 chip(选中即暂存,会话到达时应用)
 * - AgentPresetLabel → 会话头只读标签(读 sessions 汇总的 agentPreset)
 * - AgentPresetSection → 设置分区(内置/自定义卡片、复制对话框、删除确认、只读查看器、打开目录)
 * zion 不走 cordis 槽:控制器(settings/seat/section)按官方 apply 同款装配,
 * store 用 bindSnapshotSelector 绑成 hook;`conversation.hero.agentPreset` /
 * `conversation.session.header.actions` 的 SlotMap 条目由 vendored
 * ui-conversation contract 提供;`settings.general.item` / `settings.section`
 * 由 ui-settings(未 vendor)声明,此处等位。
 */
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { AssembledWire } from '../protocol/assemble.ts'
import { AgentPresetRow, type AgentPresetRowProps } from '../../vendor/ui-agent-preset/client/AgentPresetRow.tsx'
import { AgentPresetLabel, type AgentPresetLabelProps } from '../../vendor/ui-agent-preset/client/AgentPresetLabel.tsx'
import { AgentPresetSeat, type AgentPresetSeatProps } from '../../vendor/ui-agent-preset/client/AgentPresetSeat.tsx'
import { AgentPresetSection, type AgentPresetSectionProps } from '../../vendor/ui-agent-preset/client/AgentPresetSection.tsx'
import { AgentPresetSettingsController, type AgentPresetSettingsState } from '../../vendor/ui-agent-preset/client/settings-store.ts'
import { AgentPresetSeatController, type AgentPresetSeatState, type SeatSessionSummary } from '../../vendor/ui-agent-preset/client/seat-store.ts'
import { AgentPresetSectionController, type AgentPresetSectionState } from '../../vendor/ui-agent-preset/client/section-store.ts'
import { zh as presetZh, type AgentPresetSettingsKey } from '../../vendor/ui-agent-preset/client/locales.ts'
import { useRuntime } from './runtime.tsx'
import { makeT } from './locale-common.ts'

// 等位声明(官方在 ui-agent-preset client/index.ts 的 apply 与
// ui-settings/ui-settings-general 的 register,均不在 zion 编译面):
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent-preset 四表面 copy(官方 AgentPresetRow.tsx 亦自声明;此处等位防单面导入)。 */
    'settings.agentPreset': AgentPresetSettingsKey
  }
  interface SlotMap {
    /** 设置·通用区的一行(官方 ui-settings contract/slots.ts 等位;与 permission-ui 同款)。 */
    'settings.general.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
    /** 设置分区(官方 ui-settings contract/slots.ts 等位;owner.close = 关设置面板)。 */
    'settings.section': { kind: 'list'; scope: 'root'; owner: { close: () => void } }
  }
}

const presetT = makeT(presetZh as Record<string, string>)

/** 一份 wire 的四表面控制器 + 绑定好的 store hooks(稳定身份,官方 apply 同款)。 */
export interface AgentPresetSurfaces {
  settings: AgentPresetSettingsController
  seat: AgentPresetSeatController
  section: AgentPresetSectionController
  useAgentPreset: SnapshotSelectorHook<AgentPresetSettingsState>
  useAgentPresetSeat: SnapshotSelectorHook<AgentPresetSeatState>
  useAgentPresetSection: SnapshotSelectorHook<AgentPresetSectionState>
}

let cachedWire: AssembledWire | undefined
let cached: AgentPresetSurfaces | undefined

/** 每 wire 一份控制器;rosterChanged(复制/删除改目录)联动其余表面重读。 */
export function getAgentPresetSurfaces(wire: AssembledWire): AgentPresetSurfaces {
  if (cachedWire === wire && cached !== undefined) return cached
  const settings = new AgentPresetSettingsController(wire.api)
  const seat = new AgentPresetSeatController(
    wire.api,
    (): SeatSessionSummary | undefined => {
      const snapshot = wire.sessions.getListSnapshot()
      const summary = snapshot.current === undefined
        ? undefined
        : snapshot.items.find(entry => entry.sessionId === snapshot.current)
      if (summary === undefined) return undefined
      return {
        id: summary.sessionId,
        blank: summary.blank,
        ...summary.agentPreset === undefined ? {} : { agentPreset: summary.agentPreset },
      }
    },
    // 应用后的组合写入共享会话行(官方 sessions.noteAgentPreset 同款;跨表面即时)。
    (sessionId, agentPreset) => { wire.sessions.noteAgentPreset(sessionId as never, agentPreset) },
  )
  const section = new AgentPresetSectionController(wire.api, () => {
    void settings.load()
    void seat.load()
  })
  // 会话出现/切换即尝试应用暂存选择(官方 sessions.list.subscribe 同款)。
  wire.sessions.subscribe(() => { void seat.apply() })
  const surfaces: AgentPresetSurfaces = {
    settings,
    seat,
    section,
    useAgentPreset: bindSnapshotSelector({
      getSnapshot: () => settings.store.getSnapshot(),
      subscribe: listener => settings.store.subscribe(listener),
    }),
    useAgentPresetSeat: bindSnapshotSelector({
      getSnapshot: () => seat.store.getSnapshot(),
      subscribe: listener => seat.store.subscribe(listener),
    }),
    useAgentPresetSection: bindSnapshotSelector({
      getSnapshot: () => section.store.getSnapshot(),
      subscribe: listener => section.store.subscribe(listener),
    }),
  }
  cachedWire = wire
  cached = surfaces
  return surfaces
}

/** 设置·通用区的默认预设选择行(无预设部署时自返 null)。 */
export function AgentPresetRowSeat(): JSX.Element | null {
  const { wire } = useRuntime()
  const surfaces = getAgentPresetSurfaces(wire)
  const props = {
    useAgentPreset: surfaces.useAgentPreset,
    load: () => surfaces.settings.load(),
    select: (id: string) => surfaces.settings.select(id),
    t: presetT,
  } as unknown as AgentPresetRowProps
  return <AgentPresetRow {...props} />
}

/** 会话头只读预设标签(会话未记录预设时自返 null)。 */
export function AgentPresetLabelSeat(): JSX.Element | null {
  const { wire, useSessions, selectedSessionId } = useRuntime()
  const surfaces = getAgentPresetSurfaces(wire)
  const props = {
    sessionId: selectedSessionId,
    useSessions,
    useAgentPresets: surfaces.useAgentPreset,
    load: () => surfaces.settings.load(),
    t: presetT,
  } as unknown as AgentPresetLabelProps
  return <AgentPresetLabel {...props} />
}

/** 无会话 hero 的预设 chip(选中即暂存;会话到达时由控制器 apply)。 */
export function AgentPresetSeatSeat(): JSX.Element | null {
  const { wire } = useRuntime()
  const surfaces = getAgentPresetSurfaces(wire)
  const props = {
    useAgentPresetSeat: surfaces.useAgentPresetSeat,
    load: () => surfaces.seat.load(),
    select: (id: string) => surfaces.seat.select(id),
    introduced: () => surfaces.seat.introduced(),
    t: presetT,
  } as unknown as AgentPresetSeatProps
  return <AgentPresetSeat {...props} />
}

/** 设置分区:预设管理(内置/自定义卡片、复制、删除、只读查看、打开目录)。 */
export function AgentPresetSectionSeat({ onClose }: { onClose: () => void }): JSX.Element | null {
  const { wire } = useRuntime()
  const surfaces = getAgentPresetSurfaces(wire)
  const props = {
    useAgentPresetSection: surfaces.useAgentPresetSection,
    load: () => surfaces.section.load(),
    view: (id: string) => surfaces.section.view(id),
    closeView: () => surfaces.section.closeView(),
    beginCopy: (from: string) => surfaces.section.beginCopy(from),
    cancelCopy: () => surfaces.section.cancelCopy(),
    setCopyId: (id: string) => surfaces.section.setCopyId(id),
    setCopyName: (name: string) => surfaces.section.setCopyName(name),
    confirmCopy: () => surfaces.section.confirmCopy(),
    openLocation: (id: string) => surfaces.section.openLocation(id),
    // 创作入口:暂存 self-referential 预设并落在新会话上(官方 startSession 同款)。
    startCreatorDraft: () => {
      surfaces.seat.stage('cordis', true)
      void wire.sessions.create().then((res) => {
        if (!res.ok) return
        wire.sessions.select(res.value.sessionId)
      })
    },
    confirmDelete: (id: string | null) => surfaces.section.confirmDelete(id),
    remove: () => surfaces.section.remove(),
    makeDefault: (id: string) => surfaces.section.makeDefault(id),
    close: onClose,
    t: presetT,
  } as unknown as AgentPresetSectionProps
  return <AgentPresetSection {...props} />
}
