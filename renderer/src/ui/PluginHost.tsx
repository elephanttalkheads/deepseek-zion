/**
 * Plugin runtime 底座 — PluginHost 控制台。
 * 显示已加载动态插件 + 载入/卸载(演示用),cordis_run 审批卡(允许 / 批准并信任 / 拒绝),
 * 以及「运行控制台」:dynamicCordisRunner.inventory 进程级动态插件清单 + 每行
 * Run/Stop/Remove/版本选择/重试下一版本/回滚(P3-⑪:stopFromPanel/undefineFromPanel
 * 面板级远程方法;fixture 内存清单确定性驱动,real 经 3080 直发)。
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
  packages?: readonly { packageId?: string; name?: string; purpose?: string; hasClientHalf?: boolean }[] | readonly string[]
  currentPackageId?: string
  nextPackageId?: string
  activeRun?: { packageId?: string; status?: string }
  latestRun?: { packageId?: string; status?: string }
  [k: string]: unknown
}

/** 行内 package 解析(字符串列表或对象列表)。 */
function rowPackages(row: InventoryRow): { packageId: string; name?: string; purpose?: string; hasClientHalf?: boolean }[] {
  const raw = row.packages ?? []
  return raw.map(pkg => typeof pkg === 'string'
    ? { packageId: pkg }
    : { packageId: pkg.packageId ?? '', name: pkg.name, purpose: pkg.purpose, hasClientHalf: pkg.hasClientHalf === true })
    .filter(pkg => pkg.packageId !== '')
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
  // P3-⑪:每行选中的 package(版本选择器);未选时取 active/current/最新。
  const [selectedPkg, setSelectedPkg] = useState<Record<string, string>>({})

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

  const runRow = async (verb: 'run' | 'update', row: InventoryRow, packageId?: string): Promise<void> => {
    const id = row.pluginId ?? ''
    setConsoleBusy(`${verb}:${id}`)
    setConsoleResult(null)
    try {
      const agentId = typeof row.agentId === 'string' ? row.agentId : ''
      const pkg = packageId ?? selectedPackageOf(row)
      const answered = await runtime.runRow(agentId, id, pkg, verb)
      setConsoleResult(`Run(${verb}) ${id} [${pkg}]: ${answered.ok ? 'ok' : `${answered.errorCode}: ${answered.errorMessage}`}`)
    } catch (e) {
      setConsoleResult(String(e))
    }
    setConsoleBusy(null)
    void refreshInventory()
  }

  // P3-⑪:行动词(Stop/Remove)与版本选择。
  const selectedPackageOf = (row: InventoryRow): string => {
    const id = row.pluginId ?? ''
    const packages = rowPackages(row)
    const picked = selectedPkg[id]
    if (picked !== undefined && packages.some(pkg => pkg.packageId === picked)) return picked
    return row.activeRun?.packageId ?? row.currentPackageId ?? packages.at(-1)?.packageId ?? ''
  }
  const runModeOf = (row: InventoryRow, packageId: string): 'run' | 'update' =>
    row.currentPackageId !== undefined && packageId !== row.currentPackageId ? 'update' : 'run'

  const stopRow = async (row: InventoryRow): Promise<void> => {
    const id = row.pluginId ?? ''
    setConsoleBusy(`stop:${id}`)
    setConsoleResult(null)
    const answered = await runtime.stopRow(typeof row.agentId === 'string' ? row.agentId : '', id)
    setConsoleResult(`Stop ${id}: ${answered.ok ? 'ok' : answered.message ?? 'failed'}`)
    setConsoleBusy(null)
    void refreshInventory()
  }

  const removeRow = async (row: InventoryRow): Promise<void> => {
    const id = row.pluginId ?? ''
    setConsoleBusy(`remove:${id}`)
    setConsoleResult(null)
    const answered = await runtime.removeRow(typeof row.agentId === 'string' ? row.agentId : '', id)
    setConsoleResult(`Remove ${id}: ${answered.ok ? 'ok' : answered.message ?? 'failed'}`)
    setConsoleBusy(null)
    void refreshInventory()
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
              const agentId = typeof row.agentId === 'string' ? row.agentId : ''
              const packages = rowPackages(row)
              const selectedPackageId = selectedPackageOf(row)
              const status = row.activeRun !== undefined ? 'running' : 'idle'
              const transition = row.nextPackageId !== undefined && row.nextPackageId !== row.currentPackageId
              return (
                <div key={id} className="plugin-console-row" data-cordis-row={id} data-cordis-status={status}>
                  <span className="plugin-console-name">{row.name ?? id}</span>
                  <code className="plugin-console-id">{id}</code>
                  {packages.length > 1 && (
                    <label className="plugin-console-version" title="版本">
                      版本
                      <select
                        value={selectedPackageId}
                        disabled={consoleBusy !== null}
                        onChange={(e) => {
                          setSelectedPkg(prev => ({ ...prev, [id]: e.target.value }))
                        }}
                      >
                        {packages.map(pkg => (
                          <option key={pkg.packageId} value={pkg.packageId}>
                            {`${pkg.name ?? pkg.packageId} · ${pkg.packageId}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button
                    type="button"
                    className="plugin-console-run"
                    data-cordis-switch="run"
                    disabled={consoleBusy !== null || selectedPackageId === ''}
                    onClick={() => { void runRow(runModeOf(row, selectedPackageId), row, selectedPackageId) }}
                  >
                    运行
                  </button>
                  <button
                    type="button"
                    className="plugin-console-run"
                    disabled={consoleBusy !== null || row.activeRun === undefined}
                    data-cordis-switch="stop"
                    onClick={() => { void stopRow(row) }}
                  >
                    停止
                  </button>
                  <button
                    type="button"
                    className="plugin-console-run plugin-console-danger"
                    disabled={consoleBusy !== null}
                    data-cordis-remove={id}
                    onClick={() => { void removeRow(row) }}
                  >
                    移除
                  </button>
                  {transition && (
                    <span className="plugin-console-transition">
                      <code className="plugin-console-pkg">当前 {row.currentPackageId}</code>
                      <button
                        type="button"
                        className="plugin-console-run"
                        disabled={consoleBusy !== null}
                        data-cordis-switch="retry"
                        onClick={() => { void runRow('update', row, row.nextPackageId) }}
                      >
                        重试下一版本
                      </button>
                      {row.currentPackageId !== undefined && (
                        <button
                          type="button"
                          className="plugin-console-run"
                          disabled={consoleBusy !== null}
                          data-cordis-switch="rollback"
                          onClick={() => { void runRow('run', row, row.currentPackageId) }}
                        >
                          回滚
                        </button>
                      )}
                    </span>
                  )}
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
