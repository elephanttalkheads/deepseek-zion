/**
 * Plugin runtime 底座 — PluginHost 控制条 (Q17A 验证用)。
 *
 * 显示当前已加载的动态插件 + 两个加载/卸载按钮,证明"源码即闭包 +
 * guard + 附加型槽"跑通。仅供验收;量产时由模型 cordis_run 驱动。
 */
import { useEffect, useState } from 'react'
import { usePlugins } from '../plugin/hub.tsx'
import { demoPluginSource, demoTrapProbeSource } from '../plugin/demo.ts'
import type { DynamicPluginPackage } from '../plugin/runtime.ts'

export function PluginHost(): JSX.Element {
  const runtime = usePlugins()
  const [active, setActive] = useState<readonly DynamicPluginPackage[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const refresh = (): void => setActive(runtime.active())
    const off = runtime.subscribe(refresh)
    refresh()
    return off
  }, [runtime])

  const loadDemo = async (): Promise<void> => {
    setError(null)
    try {
      await runtime.load({
        pluginId: 'zion-demo', packageId: 'pkg-1', pluginRunId: 'run-1', name: 'zion-demo-additive',
        clientCode: demoPluginSource,
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const loadTraps = async (): Promise<void> => {
    setError(null)
    try {
      await runtime.load({
        pluginId: 'zion-demo-traps', packageId: 'pkg-1', pluginRunId: 'run-1', name: 'zion-demo-traps',
        clientCode: demoTrapProbeSource,
      })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const unloadAll = async (): Promise<void> => {
    for (const p of [...runtime.active()]) await runtime.unload(p.pluginId)
  }

  return (
    <div className="plugin-host" data-active={active.length}>
      <span className="plugin-host-label" title="Q17A 插件运行时底座">🧩 插件</span>
      <span className="plugin-host-state">{active.length > 0 ? active.map(p => p.pluginId).join(', ') : '未加载'}</span>
      <button type="button" onClick={() => void loadDemo()} disabled={active.some(p => p.pluginId === 'zion-demo')}>
        载入演示
      </button>
      <button type="button" onClick={() => void loadTraps()} disabled={active.some(p => p.pluginId === 'zion-demo-traps')}>
        禁区探针
      </button>
      <button type="button" onClick={() => void unloadAll()} disabled={active.length === 0}>
        卸载
      </button>
      {error !== null && <span className="plugin-host-error" title={error}>{error.slice(0, 60)}</span>}
    </div>
  )
}
