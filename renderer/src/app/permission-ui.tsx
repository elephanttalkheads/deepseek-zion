/**
 * PermissionUi — 官方权限面的 zion 适配。
 *
 * 1) PermissionSettingsRow:Settings 通用区的「权限」默认预设行(vendor
 *    ui-permission-presets PermissionRow + PermissionPresetSettingsController,
 *    settings.describe/mutate 真后端往返,revision 栅栏);Full access 走
 *    RiskConfirmation(勾选承认才可启用)。
 * 2) PermissionChip:composer 的权限 chip(vendor ui-conversation skeleton
 *    PermissionSelect),投影 `permissions` 存在时渲染;点击弹预设菜单,Full
 *    access 走同款风险确认;选择经 session.command 执行 `/permission <id>`。
 *
 * `/permission` 命令面板的 popupSelect 装饰属于 P3(MenuView + popupSelect
 * 命令弹窗系统)范围;此处保留命令列表中的裸 `/permission` 行。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { PermissionSelect as PermissionSelectValue } from '@deepseek-ai/dsh-permission-presets/client'
import { PermissionRow, type PermissionRowProps } from '../../vendor/ui-permission-presets/client/PermissionRow.tsx'
import { PermissionPresetSettingsController } from '../../vendor/ui-permission-presets/client/settings-store.ts'
import { zh as permissionZh } from '../../vendor/ui-permission-presets/client/locales.ts'
import { PermissionSelect as PermissionSelectChip } from '../../vendor/client-ui-conversation/client/skeleton/PermissionSelect.tsx'
import { zh as conversationZh } from '../../vendor/client-ui-conversation/client/locales.ts'
import { useRuntime } from './runtime.tsx'

// The official `settings.general.item` SlotMap declaration lives in
// ui-settings(整包未 vendor);here we re-declare the identical entry so the
// vendored PermissionRow's PropsRuntime<'settings.general.item'> compiles.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One preference row inside the General section(官方 ui-settings contract 等位)。 */
    'settings.general.item': { kind: 'list'; scope: 'root'; owner: { children?: never } }
  }
}

/** 字典投影翻译器({name} 插值按官方 locale 语义替换;错误文案不本地化)。 */
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

/** ui-permission-presets 的 settings.permission 字典。 */
const permissionT = makeT(permissionZh as Record<string, string>)
/** ui-conversation 的 conversation 字典(权限 chip 文案同源)。 */
const conversationT = makeT(conversationZh as Record<string, string>)

/** Settings 通用区的权限默认预设行(能力缺失 → PermissionRow 自返 null)。 */
export function PermissionSettingsRow({ wire }: { wire: ReturnType<typeof useRuntime>['wire'] }): JSX.Element | null {
  const [controller] = useState(() => new PermissionPresetSettingsController(wire.api))
  useEffect(() => () => { controller.dispose() }, [controller])
  const usePermission = useMemo<SnapshotSelectorHook<ReturnType<PermissionPresetSettingsController['store']['getSnapshot']>>>(() => {
    return bindSnapshotSelector<ReturnType<PermissionPresetSettingsController['store']['getSnapshot']>>({
      getSnapshot: () => controller.store.getSnapshot(),
      subscribe: listener => controller.store.subscribe(listener),
    })
  }, [controller])
  const load = useCallback((): Promise<void> => controller.load(), [controller])
  const select = useCallback((preset: string): Promise<void> => controller.select(preset), [controller])
  const props = { load, select, usePermission, t: permissionT } as unknown as PermissionRowProps
  return <PermissionRow {...props} />
}

/** Composer 的权限 chip(投影缺键 → 不渲染,官方同)。 */
export function PermissionChip(): JSX.Element | null {
  const { usePermissions, useConversation, wire, selectedSessionId } = useRuntime()
  const value = usePermissions(p => p) as PermissionSelectValue | null | undefined
  const locked = useConversation(s => s.running)

  if (value === undefined || value === null) return null
  const command = (line: string): Promise<boolean> => {
    if (selectedSessionId === undefined) return Promise.resolve(false)
    return wire.sessions.get(selectedSessionId).command(line).then(() => true, () => false)
  }
  return <PermissionSelectChip value={value} locked={locked} command={command} t={conversationT} />
}
