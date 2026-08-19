/**
 * Plugin runtime 底座 — PluginHost 控制台。
 * 显示已加载动态插件 + 载入/卸载(演示用),cordis_run 审批卡(允许 / 批准并信任 / 拒绝),
 * 以及「运行控制台」:dynamicCordisRunner.inventory 进程级动态插件清单 + 每行 Run/Update
 * (经 remote.runHostHalf 真发;无 host 插件时得到规范业务错误)。stop/remove 属宿主原生
 * 控制台能力(dynamicCordisRunner 无面板级远程方法),按钮以说明呈现。
 */
import { useEffect, useState } from 'react'
import { usePlugins } from '../plugin/hub.tsx'
import { demoPluginSource, demoTrapProbeSource } from '../plugin/demo.ts'
import type { DynamicPluginPackage } from '../plugin/runtime.ts'
import type { CordisRunActivity } from '../plugin/run-orchestrator.ts'

interface InventoryRow {
  pluginId?: string
  name?: string
  agentId?: string
  packages?: readonly { packageId?: string }[] | readonly string[]
  [k: string]: unknown
}

export function PluginHost(): JSX.Element {
  const runtime = usePlugins()
  const [active, setActive] = useState<readonly DynamicPluginPackage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<readonly CordisRunActivity[]>([])
  const [rows, setRows] = useState<InventoryRow[] | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [consoleBusy, setConsoleBusy] = useState<string | null>(null)
  const [consoleResult, setConsoleResult] = useState<string | null>(null)

  useEffect(() => {
    const refresh = (): void => { setActive(runtime.active()); setActivity([...runtime.runActivity().values()]) }
    const offA = runtime.subscribe(refresh)
    const offB = runtime.subscribeRuns(refresh)
    refresh()
    return () => { offA(); offB() }
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

  const refreshInventory = async (): Promise<void> => {
    setInventoryError(null)
    setConsoleResult(null)
    const res = await runtime.inventory()
    if (res.ok) setRows(res.value as InventoryRow[])
    else setInventoryError(`${res.error.code}: ${res.error.message}`)
  }

  const runRow = async (verb: 'run' | 'update', row: InventoryRow): Promise<void> => {
    setConsoleBusy(`${verb}:${row.pluginId ?? ''}`)
    setConsoleResult(null)
    try {
      // 经 hub 的 runHostHalf 直发(采样:当前 PluginHost 只经 orchestrator 审批驱动;
      // 这里暴露用户触发的 Run/Update 入口,host 无对应插件时得到规范业务错误)。
      const agentId = typeof row.agentId === 'string' ? row.agentId : ''
      const mode = verb
      const answered = await runtime.runRow(agentId, row.pluginId ?? '', row.packageId ?? '', mode)
      setConsoleResult(`Run(${mode}) ${row.pluginId ?? ''}: ${answered.ok ? 'ok' : `${answered.errorCode}: ${answered.errorMessage}`}`)
    } catch (e) {
      setConsoleResult(String(e))
    }
    setConsoleBusy(null)
  }

  const approvals = activity.filter(a => a.phase === 'awaiting-approval')

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
      {approvals.length > 0 && (
        <div className="plugin-approvals" data-count={approvals.length}>
          {approvals.map(a => (
            <div key={a.requestId} className="plugin-approval" data-kind="cordis-run">
              <div className="plugin-approval-head">
                <span className="plugin-approval-name">{a.name}</span>
                <span className="plugin-approval-mode">{a.mode}</span>
              </div>
              <div className="plugin-approval-purpose">{a.purpose}</div>
              <div className="plugin-approval-actions">
                <button type="button" className="plugin-approval-reject" onClick={() => void runtime.declineRun(a.requestId)}>拒绝</button>
                <button type="button" className="plugin-approval-allow" onClick={() => void runtime.approveRun(a.requestId, false)}>允许</button>
                <button type="button" className="plugin-approval-allow" title="批准本次并信任该插件未来版本(approveFutureVersions=true)" onClick={() => void runtime.approveRun(a.requestId, true)}>
                  批准并信任
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="plugin-console" data-kind="cordis-inventory">
        <span className="plugin-console-label">运行控制台</span>
        <button type="button" onClick={() => void refreshInventory()}>刷新清单</button>
        {inventoryError !== null && <span className="plugin-host-error" title={inventoryError}>{inventoryError.slice(0, 60)}</span>}
        {rows !== null && (
          <div className="plugin-console-rows" data-count={rows.length}>
            {rows.length === 0 && <span className="plugin-console-empty">无动态插件(运行编排由 host 经审批流驱动)</span>}
            {rows.map((row, idx) => {
              const id = row.pluginId ?? String(idx)
              const pkgId = typeof row.packageId === 'string'
                ? row.packageId
                : Array.isArray(row.packages) && typeof row.packages[0] === 'string'
                  ? row.packages[0]
                  : (row.packages?.[0] as { packageId?: string } | undefined)?.packageId ?? ''
              return (
                <div key={id} className="plugin-console-row">
                  <span className="plugin-console-name">{row.name ?? id}</span>
                  <code className="plugin-console-id">{id}</code>
                  {pkgId !== '' && <code className="plugin-console-pkg">{pkgId}</code>}
                  <button type="button" className="plugin-console-run" disabled={consoleBusy !== null} onClick={() => { void runRow('run', row) }}>运行</button>
                  <button type="button" className="plugin-console-run" disabled={consoleBusy !== null} onClick={() => { void runRow('update', row) }}>更新</button>
                  <button type="button" title="stop/remove 由宿主原生控制台执行(dynamicCordisRunner 无面板级远程方法)" disabled>停止</button>
                  <button type="button" title="同上" disabled>移除</button>
                </div>
              )
            })}
          </div>
        )}
        {consoleResult !== null && <span className="plugin-console-result" title={consoleResult}>{consoleResult.slice(0, 70)}</span>}
      </div>
    </div>
  )
}
