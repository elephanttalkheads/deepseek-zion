/**
 * Plugin runtime 底座 — 附加型槽锚点渲染器 (Q17A/Q20A)。
 *
 * renderer 各组件在锚点处调用 <SlotAnchor slot=… >,把该槽已注册的动态
 * 插件条目渲染进房间。list 槽升序排;keyed 槽按 key 分派(未占用 key 不
 * 渲染);single 槽只渲染一个席位。这是 Q20A 的"附加型":主机位由复刻独占。
 */
import { useEffect, useState } from 'react'
import React from 'react'
import { usePlugins, type PluginRuntimeHandle } from './hub.tsx'

/** Props every dynamic slot entry receives from the renderer (standardProps). */
export interface SlotOwnerProps {
  [k: string]: unknown
}

export function SlotAnchor({ slot, ownerProps, fallback }: {
  slot: string
  ownerProps?: SlotOwnerProps
  fallback?: () => JSX.Element | null
}): JSX.Element | null {
  const runtime: PluginRuntimeHandle = usePlugins()
  const [rev, setRev] = useState(0)

  // Re-render when the runtime registers/unregisters entries.
  useEffect(() => runtime.subscribe(() => setRev(r => r + 1)), [runtime])

  void rev
  const spec = runtime.slots.spec(slot)
  if (spec === undefined) return null

  if (spec.kind === 'list') {
    const entries = runtime.slots.entries(slot)
    if (entries.length === 0) return fallback?.() ?? null
    return (
      <div className="plugin-slot plugin-slot--list" data-slot={slot} data-count={entries.length}>
        {entries.map((entry, i) => {
          const Comp = entry.component as React.ComponentType<SlotOwnerProps>
          return (
            <div key={String(entry.options.id ?? i)} className="plugin-slot-entry" data-slot={slot}>
              {React.createElement(Comp, { ...(ownerProps ?? {}), _slot: slot, _entry: i })}
            </div>
          )
        })}
      </div>
    )
  }

  if (spec.kind === 'keyed') {
    const entries = runtime.slots.entries(slot)
    if (entries.length === 0) return fallback?.() ?? null
    const ownerKey = ownerProps?.key ?? ownerProps?.tool
    const matched = typeof ownerKey === 'string'
      ? entries.filter(e => e.options.key === ownerKey)
      : entries
    if (matched.length === 0) return fallback?.() ?? null
    return (
      <div className="plugin-slot plugin-slot--keyed" data-slot={slot}>
        {matched.map((entry, i) => {
          const Comp = entry.component as React.ComponentType<SlotOwnerProps>
          return (
            <div key={String(entry.options.key ?? i)} className="plugin-slot-entry" data-slot={slot}>
              {React.createElement(Comp, { ...(ownerProps ?? {}), _slot: slot, _entry: i })}
            </div>
          )
        })}
      </div>
    )
  }

  // single
  const winner = runtime.slots.winner(slot)
  if (winner === undefined) return fallback?.() ?? null
  const Comp = winner.component as React.ComponentType<SlotOwnerProps>
  return (
    <div className="plugin-slot plugin-slot--single" data-slot={slot}>
      {React.createElement(Comp, { ...(ownerProps ?? {}), _slot: slot })}
    </div>
  )
}
