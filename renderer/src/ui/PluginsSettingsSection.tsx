/**
 * PluginsSettingsSection — 设置「插件」分区(复刻对齐官方 ui-settings-plugins 形态)。
 *
 * 官方 3080 的插件页 = 标题「插件」+ intro + 两个 tab:
 *   - 插件配置(configurable):Host serve 的 settings ns ∩ 注册了浏览器卡片的 ns
 *     → 本部署三张官方卡(终端 shell / Agent 循环 agent-loop / 网页搜索
 *     web-search-deepseek),staged form(编辑 → 保存统一写,revision 栅栏)。
 *   - 插件列表(inventory):pluginInventory/list 只读清单(搜索 + 展开 + 状态点),
 *     zion 按 grilling 共识分三组:官方(@deepseek-ai/*) / MCP(dsh-mcp-client
 *     实例,非插件) / 社区(其余;行带「社区」徽标 + UI 注入面未实现说明)。
 *
 * 数据面全部走 zion 现有通道:settings.describe/mutate + credentials + rpc
 * pluginInventory/list;不拖官方 SettingsScope/card-form/cordis 注入面。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-host-apiproxy/api'

type Wire = ReturnType<typeof import('../app/runtime.tsx').useRuntime>['wire']

type PluginsTab = 'configurable' | 'inventory'

/** 官方行内模块短名(moduleShortName 语义:去 cordis:/cordis-plugin-/dsh-(host-|client-)?)。 */
function moduleShortName(moduleName: string): string {
  const unscoped = moduleName.startsWith('@') ? moduleName.slice(moduleName.indexOf('/') + 1) : moduleName
  return unscoped
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^dsh-(?:host-|client-)?/, '')
}

/** MCP 实例行显示名:从 entryId 提取 serverName(include:mcp-github → github)。 */
function mcpServerName(entryId: string): string {
  const m = /^(?:include:)?mcp-(.+)$/.exec(entryId)
  return m !== null ? m[1] : entryId
}

// ---- 清单条目(pluginInventory/list 返回形状) ----

interface PluginInventoryEntry {
  entryId: string
  moduleName: string
  enabled: boolean
  fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null
}

type InventoryGroup = 'official' | 'mcp' | 'community'

const GROUP_LABEL: Record<InventoryGroup, string> = {
  official: '官方',
  mcp: 'MCP',
  community: '社区',
}

const PHASE_LABEL: Record<string, string> = {
  pending: '等待依赖',
  loading: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
  unobserved: '未挂载',
}

function groupOf(entry: PluginInventoryEntry): InventoryGroup {
  if (entry.moduleName === '@deepseek-ai/dsh-mcp-client') return 'mcp'
  if (entry.moduleName.startsWith('@deepseek-ai/')) return 'official'
  return 'community'
}

function displayNameOf(entry: PluginInventoryEntry): string {
  return groupOf(entry) === 'mcp' ? mcpServerName(entry.entryId) : moduleShortName(entry.moduleName)
}

function matches(entry: PluginInventoryEntry, q: string): boolean {
  if (q.length === 0) return true
  return [entry.moduleName, entry.entryId, displayNameOf(entry)]
    .some(v => v.toLocaleLowerCase().includes(q))
}

// ---- 插件配置卡片:staged form 模型 ----

interface CardFieldSpec {
  key: string
  label: string
  hint: string
  numeric?: boolean
}

interface CardSpec {
  ns: string
  title: string
  description: string
  fields: CardFieldSpec[]
  /** 网页搜索卡片:走 credentials 域的密钥控件。 */
  secret?: { label: string; hint: string }
}

const CARDS: CardSpec[] = [
  {
    ns: 'shell',
    title: '终端',
    description: '限制 agent 运行的每一条命令。',
    fields: [
      { key: 'timeoutMs', label: '命令超时（毫秒）', hint: '单条命令允许运行多久，超时即终止。', numeric: true },
      { key: 'maxOutputBytes', label: '单流输出上限（字节）', hint: '超出部分会转存到临时文件，而不是被丢弃。', numeric: true },
    ],
  },
  {
    ns: 'agent-loop',
    title: 'Agent 循环',
    description: 'Agent 如何派发工具调用。',
    fields: [
      { key: 'maxParallelToolCalls', label: '并行工具调用数', hint: '同一步内最多同时运行多少个可并行的调用。', numeric: true },
    ],
  },
  {
    ns: 'web-search-deepseek',
    title: '网页搜索',
    description: 'DeepSeek 搜索提供方。',
    secret: {
      label: 'API Key',
      hint: '不写入设置文件。留空表示保持当前密钥。',
    },
    fields: [
      { key: 'baseURL', label: '接口地址', hint: '留空则使用提供方默认地址。' },
      { key: 'maxUses', label: '单次请求最多搜索次数', hint: '一次请求在必须作答前最多可以搜索多少次。', numeric: true },
    ],
  },
]

const DEFAULT_API_KEY_REF = 'DEEPSEEK_API_KEY'

/** 单张卡片:展开/收起 + staged 编辑 + 保存(settings.mutate)+ 放弃/恢复默认。 */
function PluginCardView({ wire, spec, onError }: { wire: Wire; spec: CardSpec; onError: (m: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<SettingsNamespaceView | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [cred, setCred] = useState<{ configured: boolean; writable: boolean } | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const res = await wire.api.settings.describe({})
    if (!res.result.ok) return
    const ns = res.result.value.namespaces.find(n => n.ns === spec.ns)
    setView(ns ?? null)
    if (spec.secret !== undefined) {
      const ref = (ns?.value as { apiKeyEnv?: string } | undefined)?.apiKeyEnv ?? DEFAULT_API_KEY_REF
      const cre = await wire.api.credentials.describe({ refs: [ref] })
      if (cre.result.ok) {
        const v = cre.result.value.credentials[ref]
        setCred(v !== undefined ? { configured: v.configured, writable: v.writable } : null)
      }
    }
  }, [wire, spec])

  useEffect(() => { void reload() }, [reload])

  const value = view?.value as Record<string, unknown> | undefined
  const user = view?.user as Record<string, unknown> | undefined
  const writable = view !== null && (view as unknown as { writable?: boolean }).writable !== false
  const available = view !== null

  const fieldState = (f: CardFieldSpec): { text: string; overridden: boolean; invalid: boolean } => {
    const draft = drafts[f.key]
    if (draft !== undefined) {
      const invalid = f.numeric === true && draft.trim() !== '' && !Number.isFinite(Number(draft))
      return { text: draft, overridden: draft.trim() !== '', invalid }
    }
    const raw = value?.[f.key]
    const text = raw !== undefined && raw !== null ? String(raw) : ''
    return { text, overridden: user !== undefined && Object.hasOwn(user, f.key), invalid: false }
  }

  const dirty = Object.keys(drafts).length > 0
  const anyInvalid = spec.fields.some(f => fieldState(f).invalid)

  const edit = (f: CardFieldSpec, text: string): void => {
    setDrafts(prev => ({ ...prev, [f.key]: text }))
    setFailed(false)
  }

  const resetField = (f: CardFieldSpec): void => {
    setDrafts(prev => ({ ...prev, [f.key]: '' }))
    setFailed(false)
  }

  const discard = (): void => {
    setDrafts({})
    setFailed(false)
  }

  const save = async (): Promise<void> => {
    if (dirty === false || saving) return
    setSaving(true)
    setFailed(false)
    let landed = true
    // 密钥先走 credentials 域(独立存储;留空不写,保持当前密钥)。
    if (spec.secret !== undefined && drafts.secret !== undefined && drafts.secret.trim() !== '') {
      const ref = (view?.value as { apiKeyEnv?: string } | undefined)?.apiKeyEnv ?? DEFAULT_API_KEY_REF
      const res = await wire.api.credentials.set({ ref, value: drafts.secret.trim() })
      if (!res.result.ok) { onError(res.result.error?.message ?? 'credentials.set failed'); landed = false }
    }
    // 设置字段统一 mutate(revision 栅栏);空草稿 = unset(恢复默认)。
    const ops: { op: 'set' | 'unset'; path: string[]; value?: unknown }[] = []
    for (const f of spec.fields) {
      const d = drafts[f.key]
      if (d === undefined) continue
      if (d.trim() === '') ops.push({ op: 'unset', path: [f.key] })
      else ops.push({ op: 'set', path: [f.key], value: f.numeric === true ? Number(d) : d })
    }
    if (ops.length > 0) {
      const res = await wire.api.settings.mutate({
        ns: spec.ns,
        ops: ops as never,
        ...(view?.revision === undefined ? {} : { expectedRevision: view.revision }),
      })
      if (res.result.ok) {
        setView(res.result.value)
      } else {
        onError(res.result.error?.message ?? `settings.mutate(${spec.ns}) failed`)
        landed = false
      }
    }
    if (landed) setDrafts({})
    setSaving(false)
    setFailed(!landed)
  }

  const blocked = !dirty || anyInvalid || saving

  if (!available) return <></>

  return (
    <li className="plugin-card" data-open={open || undefined}>
      <button
        type="button"
        className="plugin-card-header"
        aria-expanded={open}
        aria-label={`${open ? '收起' : '展开'}设置: ${spec.title}`}
        onClick={() => { setOpen(v => !v) }}
      >
        <span className="plugin-card-headtext">
          <span className="plugin-card-name">{spec.title}</span>
          <span className="plugin-card-description">{spec.description}</span>
        </span>
        {dirty && <span className="plugin-card-pending">未保存</span>}
        <span className="plugin-card-chevron" data-open={open || undefined}>▾</span>
      </button>
      {open && (
        <div className="plugin-card-body">
          {!writable && <p className="plugin-card-readonly" role="status">本部署的设置为只读。</p>}
          {spec.secret !== undefined && (
            <div className="plugin-field">
              <div className="plugin-field-head">
                <label className="plugin-field-label" htmlFor={`plugin-config-${spec.ns}-key`}>{spec.secret.label}</label>
                <span className="plugin-field-badges">
                  <span className={cred?.configured === true ? 'plugin-field-badge' : 'plugin-field-badge plugin-field-badge-muted'}>
                    {cred?.configured === true ? '已配置密钥。' : '未配置密钥；配置之前搜索不可用。'}
                  </span>
                </span>
              </div>
              <input
                id={`plugin-config-${spec.ns}-key`}
                className="plugin-field-input"
                type="password"
                autoComplete="off"
                value={drafts.secret ?? ''}
                disabled={!writable || cred?.writable === false}
                placeholder={cred?.configured === true ? '已保存，留空表示不修改' : '输入 API key'}
                onChange={e => { setDrafts(prev => ({ ...prev, secret: e.target.value })); setFailed(false) }}
              />
              <p className="plugin-field-hint">{spec.secret.hint}</p>
            </div>
          )}
          {spec.fields.map(f => {
            const s = fieldState(f)
            return (
              <div className="plugin-field" key={f.key}>
                <div className="plugin-field-head">
                  <label className="plugin-field-label" htmlFor={`plugin-config-${spec.ns}-${f.key}`}>{f.label}</label>
                  {s.overridden && (
                    <span className="plugin-field-badges">
                      <span className="plugin-field-badge">已覆盖</span>
                      <button
                        type="button"
                        className="plugin-field-reset"
                        disabled={!writable}
                        onClick={() => { resetField(f) }}
                      >
                        恢复默认
                      </button>
                    </span>
                  )}
                </div>
                <input
                  id={`plugin-config-${spec.ns}-${f.key}`}
                  className={s.invalid ? 'plugin-field-input plugin-field-input-invalid' : 'plugin-field-input'}
                  type="text"
                  inputMode={f.numeric === true ? 'numeric' : undefined}
                  aria-invalid={s.invalid || undefined}
                  value={s.text}
                  disabled={!writable}
                  onChange={e => { edit(f, e.target.value) }}
                />
                <p className={s.invalid ? 'plugin-field-invalid' : 'plugin-field-hint'}>
                  {s.invalid ? '请填数字；留空表示使用默认值。' : f.hint}
                </p>
              </div>
            )
          })}
          <div className="plugin-card-footer">
            {failed && <p className="plugin-card-failed" role="status">本部署没有接受这些值，已保留供你修改。</p>}
            <button type="button" className="plugin-card-discard" disabled={!dirty || saving} onClick={discard}>
              放弃修改
            </button>
            <button type="button" className="plugin-card-save" disabled={blocked} onClick={() => { void save() }}>
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// ---- 插件配置 tab ----

function ConfigurableTab({ wire, onError }: { wire: Wire; onError: (m: string) => void }): JSX.Element {
  return (
    <ul className="plugin-cards">
      {CARDS.map(card => <PluginCardView key={card.ns} wire={wire} spec={card} onError={onError} />)}
    </ul>
  )
}

// ---- 插件列表 tab(三组:官方 / MCP / 社区) ----

function InventoryTab({ wire }: { wire: Wire }): JSX.Element {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [entries, setEntries] = useState<readonly PluginInventoryEntry[]>([])
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [request, setRequest] = useState(0)

  const load = useCallback((): void => {
    setState('loading')
    void wire.rpc.call('/api', 'pluginInventory/list', { args: {} }).then(res => {
      if (res.ok) {
        setEntries((res.value as { entries: PluginInventoryEntry[] }).entries ?? [])
        setState('ready')
      } else {
        setState('error')
      }
    })
  }, [wire])

  useEffect(() => { load() }, [load, request])

  const q = query.trim().toLocaleLowerCase()
  const filteredCount = entries.filter(e => matches(e, q)).length
  const groups = useMemo(() => {
    const result: Record<InventoryGroup, PluginInventoryEntry[]> = { official: [], mcp: [], community: [] }
    for (const entry of entries) {
      if (!matches(entry, q)) continue
      result[groupOf(entry)].push(entry)
    }
    return result
  }, [entries, q])

  useEffect(() => {
    if (expanded !== null && !entries.some(e => e.entryId === expanded)) setExpanded(null)
  }, [expanded, entries])

  const retry = (): void => { setRequest(v => v + 1) }

  return (
    <div className="plugin-inventory" aria-busy={state === 'loading'}>
      {state === 'loading' && <p className="plugin-inventory-status">正在读取插件…</p>}
      {state === 'error' && (
        <div className="plugin-inventory-failure">
          <p role="alert">暂时无法读取插件。</p>
          <button type="button" onClick={retry}>重试</button>
        </div>
      )}
      {state === 'ready' && (
        <div className="plugin-inventory-catalog">
          <label className="plugin-inventory-search">
            <input
              type="search"
              value={query}
              placeholder="搜索插件"
              aria-label="搜索插件"
              onChange={e => { setQuery(e.currentTarget.value) }}
            />
          </label>
          <div className="plugin-inventory-catalog-head">
            <h3>插件列表</h3>
            <span data-plugin-count={filteredCount}>{filteredCount}</span>
          </div>
          {entries.length === 0 && <p className="plugin-inventory-status">暂无插件。</p>}
          {(Object.keys(GROUP_LABEL) as InventoryGroup[]).map(group => {
            const rows = groups[group]
            if (rows.length === 0) return null
            const isCommunity = group === 'community'
            return (
              <div className="plugin-inventory-group" data-group={group} key={group}>
                <h3 className="plugin-inventory-group-head">
                  <span>{GROUP_LABEL[group]}</span>
                  <span className="plugin-inventory-group-count" data-count={rows.length}>{rows.length}</span>
                </h3>
                <ul className="plugin-inventory-cards">
                  {rows.map(entry => {
                    const open = expanded === entry.entryId
                    const status = entry.fiberPhase === null ? PHASE_LABEL.unobserved : (PHASE_LABEL[entry.fiberPhase] ?? entry.fiberPhase)
                    const title = displayNameOf(entry)
                    const configuration = entry.enabled ? '已启用' : '已停用'
                    return (
                      <li
                        className="plugin-inventory-card"
                        key={entry.entryId}
                        data-plugin-entry={entry.entryId}
                        data-open={open || undefined}
                      >
                        <button
                          type="button"
                          className="plugin-inventory-card-content"
                          aria-expanded={open}
                          aria-label={`${title}, ${status}, ${configuration}`}
                          onClick={() => { setExpanded(cur => cur === entry.entryId ? null : entry.entryId) }}
                        >
                          <strong className="plugin-inventory-card-title" title={entry.moduleName}>{title}</strong>
                          {isCommunity && <span className="plugin-inventory-community-tag">社区</span>}
                          <span className="plugin-inventory-card-trailing">
                            {entry.enabled && (
                              <span
                                className="plugin-inventory-status-dot"
                                data-phase={entry.fiberPhase ?? 'unobserved'}
                                role="img"
                                aria-label={status}
                                title={status}
                              />
                            )}
                            <span className="plugin-inventory-config-tag" data-enabled={entry.enabled ? 'true' : 'false'}>
                              {configuration}
                            </span>
                            <span className="plugin-inventory-chevron" data-open={open || undefined}>▾</span>
                          </span>
                        </button>
                        {open && (
                          <div className="plugin-inventory-card-details">
                            <code className="plugin-inventory-entry-value" data-loader-entry>{entry.entryId}</code>
                            <dl className="plugin-inventory-details">
                              <div>
                                <dt>配置状态</dt>
                                <dd>{configuration}</dd>
                              </div>
                              {entry.enabled && (
                                <div>
                                  <dt>Cordis 状态</dt>
                                  <dd>{status}</dd>
                                </div>
                              )}
                              {isCommunity && (
                                <div className="plugin-inventory-community-note" data-ui-injection-note>
                                  <dt>复刻 UI 说明</dt>
                                  <dd>社区插件:其 UI 注入面(设置分区/命令面板)在复刻 UI 中未实现。</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          {entries.length > 0 && q !== '' && Object.values(groups).every(rows => rows.length === 0) && (
            <p className="plugin-inventory-status">没有匹配的插件。</p>
          )}
        </div>
      )}
    </div>
  )
}

// ---- 分区主体 ----

export function PluginsSettingsSection({ wire, onError }: { wire: Wire; onError: (m: string) => void }): JSX.Element {
  const [tab, setTab] = useState<PluginsTab>('configurable')

  return (
    <div className="plugins-section">
      <h2 className="settings-section-title">插件</h2>
      <p className="settings-hint">配置和查看本部署已安装的插件。</p>
      <div className="plugins-tabs" role="tablist" aria-label="插件视图">
        <button
          type="button"
          role="tab"
          className={tab === 'configurable' ? 'plugins-tab plugins-tab-active' : 'plugins-tab'}
          aria-selected={tab === 'configurable'}
          data-active={tab === 'configurable' || undefined}
          onClick={() => { setTab('configurable') }}
        >
          插件配置
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'inventory' ? 'plugins-tab plugins-tab-active' : 'plugins-tab'}
          aria-selected={tab === 'inventory'}
          data-active={tab === 'inventory' || undefined}
          onClick={() => { setTab('inventory') }}
        >
          插件列表
        </button>
      </div>
      {tab === 'configurable' ? (
        <ConfigurableTab wire={wire} onError={onError} />
      ) : (
        <InventoryTab wire={wire} />
      )}
    </div>
  )
}
