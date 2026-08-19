/**
 * SettingsShell — 设置管理界面。
 * 分区:通用(外观三 cube + 语言,settings.describe/mutate 真后端可写且 revision 栅栏);
 * 模型(Provider 目录 + Provider 编辑:API key=credentials.describe/set/unset,
 * 模型目录=settings.mutate op set(路径自适应:命名空间根级 models ↑ providers.<key>.models),
 * 探活=llm.discoverModels,采用即合入模型目录);插件 / 插件清单占位。
 * 入口:Sidebar 页脚齿轮。一期壳+通用+目录只读;二期 Provider 编辑。
 */
import { useCallback, useEffect, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import { PermissionSettingsRow } from '../app/permission-ui.tsx'
import type { SettingsNamespaceView, ConfigurableProviderView } from '@deepseek-ai/dsh-host-apiproxy/api'

type SectionId = 'general' | 'models' | 'plugins' | 'inventory'

const THEME_CHOICES = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '跟随系统' },
] as const

function applyTheme(pref: string | undefined): void {
  const theme = pref === 'light' || pref === 'dark' ? pref : 'system'
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme
}

export function SettingsShell({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { wire } = useRuntime()
  const [section, setSection] = useState<SectionId>('general')
  const [namespaces, setNamespaces] = useState<SettingsNamespaceView[] | null>(null)
  const [describeError, setDescribeError] = useState<string | null>(null)
  const [writeBusy, setWriteBusy] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setDescribeError(null)
    const res = await wire.api.settings.describe({})
    if (res.result.ok) setNamespaces(res.result.value.namespaces)
    else setDescribeError(res.result.error?.message ?? 'settings.describe failed')
  }, [wire])

  useEffect(() => {
    if (open) {
      void reload()
      void wire.api.settings.describe({}).then((res) => {
        if (res.result.ok) {
          const ns = res.result.value.namespaces.find(n => n.ns === 'ui-theme')
          applyTheme((ns?.value as { preference?: string } | null)?.preference)
        }
      })
    } else {
      setWriteError(null)
    }
  }, [open, reload, wire])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return <span data-settings-shell="closed" hidden />

  const nsView = (nsName: string): SettingsNamespaceView | undefined =>
    namespaces?.find(n => n.ns === nsName)
  const nsPreference = (nsName: string): string | undefined =>
    (nsView(nsName)?.value as { preference?: string } | null)?.preference

  const writePreference = async (nsName: string, value: string): Promise<boolean> => {
    setWriteBusy(nsName)
    setWriteError(null)
    try {
      const d = await wire.api.settings.describe({})
      const ns = d.result.ok
        ? d.result.value.namespaces.find(n => n.ns === nsName)
        : undefined
      const revision = ns?.revision
      const res = await wire.api.settings.mutate({
        ns: nsName,
        ops: [{ op: 'set', path: ['preference'], value }],
        ...(revision === undefined ? {} : { expectedRevision: revision }),
      })
      if (res.result.ok) {
        if (nsName === 'ui-theme') applyTheme(value)
        await reload()
        return true
      }
      setWriteError(res.result.error?.message ?? `settings.mutate(${nsName}) failed`)
      return false
    } catch (e) {
      setWriteError(String(e))
      return false
    } finally {
      setWriteBusy(null)
    }
  }

  return (
    <div className="settings-shell" role="dialog" aria-modal="true" aria-label="设置">
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-panel">
        <header className="settings-header">
          <span className="settings-title">设置</span>
          <button className="settings-close" type="button" onClick={onClose} aria-label="关闭设置">✕</button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="设置分区">
            {([
              ['general', '通用'],
              ['models', '模型'],
              ['plugins', '插件'],
              ['inventory', '插件清单'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={section === id ? 'settings-nav-item settings-nav-item-active' : 'settings-nav-item'}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => { setSection(id) }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {describeError !== null && <p className="settings-error">{describeError}</p>}
            {writeError !== null && <p className="settings-error">写入失败:{writeError}</p>}

            {section === 'general' && (
              <div className="settings-section">
                <h2 className="settings-section-title">通用</h2>
                <div className="settings-row">
                  <span className="settings-row-label">外观</span>
                  <div className="settings-appearance" role="group" aria-label="外观">
                    {THEME_CHOICES.map(choice => (
                      <button
                        key={choice.id}
                        type="button"
                        className="settings-cube"
                        data-active={(nsPreference('ui-theme') ?? 'system') === choice.id || undefined}
                        aria-pressed={(nsPreference('ui-theme') ?? 'system') === choice.id}
                        disabled={writeBusy === 'ui-theme'}
                        onClick={() => { void writePreference('ui-theme', choice.id) }}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="settings-row">
                  <span className="settings-row-label">语言</span>
                  <select
                    className="settings-select"
                    value={nsPreference('locale') ?? ''}
                    disabled={writeBusy === 'locale'}
                    onChange={(e) => { void writePreference('locale', e.target.value) }}
                  >
                    <option value="" disabled>选择语言</option>
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <PermissionSettingsRow wire={wire} />
                <p className="settings-hint">偏好经 settings.mutate 写入真后端(revision 栅栏);主题已即时应用到本页。</p>
              </div>
            )}

            {section === 'models' && <ModelsSection wire={wire} onError={(m) => setWriteError(m)} />}

            {section === 'plugins' && (
              <div className="settings-section">
                <h2 className="settings-section-title">插件</h2>
                <p className="settings-hint">可配置插件卡片(Bash / AgentLoop / WebSearch)下一期接入。</p>
              </div>
            )}

            {section === 'inventory' && (
              <div className="settings-section">
                <h2 className="settings-section-title">插件清单</h2>
                <p className="settings-hint">pluginInventory 只读清单下一期接入。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

type Wire = ReturnType<typeof useRuntime>['wire']

/** 模型分区:Provider 目录 + 选中后进入 ProviderEditPanel。 */
function ModelsSection({ wire, onError }: { wire: Wire; onError: (msg: string) => void }): JSX.Element {
  const [providers, setProviders] = useState<ConfigurableProviderView[] | null>(null)
  const [editing, setEditing] = useState<ConfigurableProviderView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void wire.api.llm.providers({}).then((res) => {
      if (cancelled) return
      if (res.result.ok) setProviders(res.result.value.providers)
      else setError(res.result.error?.message ?? 'llm.providers failed')
    })
    return () => { cancelled = true }
  }, [wire])

  if (editing !== null) {
    return (
      <ProviderEditPanel
        wire={wire}
        view={editing}
        onBack={() => { setEditing(null) }}
        onError={(m) => { onError(m); setError(m) }}
        onMutate={() => { setError(null) }}
      />
    )
  }

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">模型</h2>
      {error !== null && <p className="settings-error">{error}</p>}
      {providers === null ? (
        <p className="settings-hint">加载 Provider 目录…</p>
      ) : (
        <>
          <p className="settings-hint">共 {providers.length} 个可配置 Provider;点「编辑」进入该 Provider 的配置面板。</p>
          <ul className="settings-provider-list">
            {providers.map(p => (
              <li key={p.provider} className="settings-provider-row">
                <span className="settings-provider-name">{p.displayName ?? p.provider}</span>
                <code className="settings-provider-key">{p.provider}</code>
                <span className={p.active ? 'settings-provider-state settings-provider-active' : 'settings-provider-state'}>
                  {p.active ? 'active' : 'idle'}
                </span>
                {p.settingsNs !== undefined && <code className="settings-provider-ns">{p.settingsNs}</code>}
                <button
                  type="button"
                  className="settings-provider-edit"
                  onClick={() => { setEditing(p) }}
                >
                  编辑
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

type ProviderModelsEntry = { id: string; name?: string; contextWindow?: number }

function entryId(entry: unknown): string {
  return typeof entry === 'string' ? entry : String((entry as { id?: string })?.id ?? entry)
}

/**
 * Provider 编辑面板。
 * 模型目录定位:命名空间值根级有 `models` 数组(如 llm-deepseek)→ 路径 ['models'];
 * 否则走 providers.<providerKey>.models 嵌套(llm-pi-ai 型,常为空、注册表驱动)。
 * API key:provider 的 apiKeyEnv 引用 → credentials.describe/set/unset。
 * 探活:llm.discoverModels(注册表路径,不发网络)。
 */
function ProviderEditPanel({ wire, view, onBack, onError, onMutate }: {
  wire: Wire
  view: ConfigurableProviderView
  onBack: () => void
  onError: (msg: string) => void
  onMutate: () => void
}): JSX.Element {
  const nsName = view.settingsNs
  const providerPath = view.settingsPath ?? []
  const [keyRef, setKeyRef] = useState<string | null>(null)
  const [keyState, setKeyState] = useState<{ configured: boolean; source?: string; writable: boolean } | null>(null)
  const [keyDraft, setKeyDraft] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [models, setModels] = useState<ProviderModelsEntry[] | null>(null)
  const [modelPath, setModelPath] = useState<string[] | null>(null)
  const [modelDraft, setModelDraft] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [candidates, setCandidates] = useState<(ProviderModelsEntry & { contextWindow?: number })[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 初次(及每次进入)加载:解析命名空间值 → apiKeyEnv + 模型目录路径与条目 + 凭证状态。
  useEffect(() => {
    if (nsName === undefined) { setError('该 Provider 无设置命名空间'); return }
    let cancelled = false
    void (async () => {
      try {
        const d = await wire.api.settings.describe({})
        if (cancelled) return
        if (!d.result.ok) throw new Error(d.result.error?.message ?? 'describe failed')
        const ns = d.result.value.namespaces.find(n => n.ns === nsName)
        const root = ns?.value as Record<string, unknown> | undefined
        let path: string[] | null = null
        let block: Record<string, unknown> | null = null
        if (Array.isArray(root?.models)) {
          path = ['models']; block = root ?? null
        } else if (providerPath.length > 0) {
          let cursor: unknown = root
          for (const seg of providerPath) {
            if (cursor !== null && typeof cursor === 'object') cursor = (cursor as Record<string, unknown>)[seg]
            else { cursor = undefined; break }
          }
          const obj = cursor as Record<string, unknown> | undefined
          if (obj !== null && typeof obj === 'object') {
            block = obj
            if (Array.isArray(obj.models)) path = [...providerPath, 'models']
          }
        }
        setModelPath(path)
        const ref = block?.apiKeyEnv ?? null
        setKeyRef(ref)
        const raw = path !== null
          ? path.reduce((o, k) => (o === null || typeof o !== 'object' ? undefined : (o as Record<string, unknown>)[k]), root)
          : undefined
        const list = Array.isArray(raw)
          ? (raw as unknown[]).map(m => typeof m === 'string' ? ({ id: m }) : ({ id: entryId(m), name: (m as { name?: string })?.name, contextWindow: (m as { contextWindow?: number })?.contextWindow }))
          : []
        setModels(list)
        if (ref !== null) {
          const cre = await wire.api.credentials.describe({ refs: [ref] })
          if (!cancelled && cre.result.ok) {
            const v = cre.result.value.credentials[ref]
            setKeyState(v !== undefined ? { configured: v.configured, source: v.source, writable: v.writable } : null)
          }
        }
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    })()
    return () => { cancelled = true }
  }, [wire, nsName, providerPath])

  const refreshKey = useCallback(async (): Promise<void> => {
    if (keyRef === null) return
    const res = await wire.api.credentials.describe({ refs: [keyRef] })
    if (res.result.ok) {
      const v = res.result.value.credentials[keyRef]
      setKeyState(v !== undefined ? { configured: v.configured, source: v.source, writable: v.writable } : null)
    }
  }, [wire, keyRef])

  const saveApiKey = async (): Promise<void> => {
    if (keyRef === null) return
    setBusy('key'); setError(null)
    try {
      const res = await wire.api.credentials.set({ ref: keyRef, value: keyDraft })
      if (res.result.ok) { setKeyDraft(''); await refreshKey() }
      else onError(res.result.error?.message ?? 'credentials.set failed')
    } catch (e) { onError(String(e)) }
    setBusy(null)
  }

  const clearApiKey = async (): Promise<void> => {
    if (keyRef === null) return
    setBusy('key')
    try {
      const res = await wire.api.credentials.unset({ ref: keyRef })
      if (res.result.ok) await refreshKey()
      else onError(res.result.error?.message ?? 'credentials.unset failed')
    } catch (e) { onError(String(e)) }
    setBusy(null)
  }

  const writeModels = async (next: ProviderModelsEntry[]): Promise<boolean> => {
    if (modelPath === null) { onError('该 Provider 无配置模型目录(models 路径)'); return false }
    setBusy('models'); setError(null)
    try {
      const d = await wire.api.settings.describe({})
      const ns = d.result.ok ? d.result.value.namespaces.find(n => n.ns === nsName) : undefined
      const res = await wire.api.settings.mutate({
        ns: nsName,
        ops: [{ op: 'set', path: modelPath, value: next }],
        ...(ns === undefined || ns.revision === undefined ? {} : { expectedRevision: ns.revision }),
      })
      setBusy(null)
      if (res.result.ok) { setModels(next); onMutate(); return true }
      onError(res.result.error?.message ?? 'settings.mutate(models) failed')
      return false
    } catch (e) { setBusy(null); onError(String(e)); return false }
  }

  const addModel = async (): Promise<void> => {
    const id = modelDraft.trim()
    if (id === '' || models === null) return
    if (models.some(m => m.id === id)) { onError(`模型 ${id} 已在目录中`); return }
    await writeModels([...models, { id }])
    setModelDraft('')
  }

  const removeModel = async (id: string): Promise<void> => {
    if (models === null) return
    await writeModels(models.filter(m => m.id !== id))
  }

  const discover = async (): Promise<void> => {
    if (nsName === undefined) return
    setDiscovering(true); setError(null)
    try {
      const res = await wire.api.llm.discoverModels({ settingsNs: nsName, provider: view.provider })
      if (res.result.ok) {
        setCandidates(res.result.value.models.map(m => ({ id: m.id, name: m.name, contextWindow: m.contextWindow })))
      } else {
        setCandidates(null)
        onError(res.result.error?.message ?? 'llm.discoverModels failed')
      }
    } catch (e) { onError(String(e)) }
    setDiscovering(false)
  }

  const adoptCandidate = async (id: string): Promise<void> => {
    if (models === null) return
    const found = candidates?.find(c => c.id === id)
    if (!models.some(m => m.id === id)) {
      await writeModels([...models, { id, name: found?.name, contextWindow: found?.contextWindow }])
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-editor-head">
        <button type="button" className="settings-back" onClick={onBack}>← 返回</button>
        <h2 className="settings-section-title">
          {view.displayName ?? view.provider}
          <code className="settings-provider-key"> {view.provider}</code>
        </h2>
      </div>
      {error !== null && <p className="settings-error">{error}</p>}

      {/* API key */}
      <div className="settings-editor-block">
        <h3 className="settings-editor-block-title">API key{keyRef !== null && <code className="settings-provider-key"> {keyRef}</code>}</h3>
        {keyRef === null ? (
          <p className="settings-hint">该 Provider 未声明 apiKeyEnv(无凭证引用)。</p>
        ) : keyState === null ? (
          <p className="settings-hint">读取凭证状态…</p>
        ) : (
          <div className="settings-row">
            <input
              className="settings-input"
              type="password"
              placeholder={keyState.configured ? `已配置(${keyState.source ?? ''});输入新值覆盖` : '输入 API key'}
              value={keyDraft}
              disabled={busy === 'key' || !keyState.writable}
              onChange={(e) => { setKeyDraft(e.target.value) }}
            />
            <button className="settings-btn" type="button" disabled={busy === 'key' || keyDraft === '' || !keyState.writable} onClick={() => { void saveApiKey() }}>
              保存
            </button>
            <button className="settings-btn" type="button" disabled={busy === 'key' || !keyState.writable} onClick={() => { void clearApiKey() }}>
              清除
            </button>
            {!keyState.writable && <p className="settings-hint">当前只读(被环境变量遮蔽)。</p>}
          </div>
        )}
      </div>

      {/* 模型目录 */}
      <div className="settings-editor-block">
        <h3 className="settings-editor-block-title">模型目录{modelPath !== null && <code className="settings-provider-key"> {modelPath.join('.')}</code>}</h3>
        {modelPath === null ? (
          <p className="settings-hint">该 Provider 无配置模型目录(目录由注册表驱动)。</p>
        ) : models === null ? (
          <p className="settings-hint">读取模型目录…</p>
        ) : (
          <>
            <ul className="settings-model-list">
              {models.map(m => (
                <li key={m.id} className="settings-model-row">
                  <span>{m.name ?? m.id}</span>
                  {m.id !== (m.name ?? m.id) && <code className="settings-provider-ns">{m.id}</code>}
                  <button type="button" className="settings-btn settings-btn-tiny" disabled={busy === 'models'} onClick={() => { void removeModel(m.id) }}>移除</button>
                </li>
              ))}
            </ul>
            <div className="settings-row">
              <input
                className="settings-input"
                placeholder="模型 id,如 deepseek-v4-flash"
                value={modelDraft}
                disabled={busy === 'models'}
                onChange={(e) => { setModelDraft(e.target.value) }}
                onKeyDown={(e) => { if (e.key === 'Enter') void addModel() }}
              />
              <button className="settings-btn" type="button" disabled={busy === 'models' || modelDraft.trim() === ''} onClick={() => { void addModel() }}>
                添加
              </button>
            </div>
          </>
        )}
      </div>

      {/* 探活 */}
      <div className="settings-editor-block">
        <h3 className="settings-editor-block-title">发现模型(探活)</h3>
        <button className="settings-btn" type="button" disabled={discovering} onClick={() => { void discover() }}>
          {discovering ? '探测中…' : '探测'}
        </button>
        {candidates !== null && (
          <>
            <p className="settings-hint">{candidates.length} 个候选模型;点「采用」合入目录(不落凭证)。</p>
            <ul className="settings-model-list">
              {candidates.map(c => (
                <li key={c.id} className="settings-model-row">
                  <span>{c.name ?? c.id}</span>
                  {c.contextWindow !== undefined && <code className="settings-provider-ns">ctx {c.contextWindow}</code>}
                  <button type="button" className="settings-btn settings-btn-tiny" disabled={busy === 'models'} onClick={() => { void adoptCandidate(c.id) }}>
                    {models !== null && models.some(m => m.id === c.id) ? '已在目录' : '采用'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
