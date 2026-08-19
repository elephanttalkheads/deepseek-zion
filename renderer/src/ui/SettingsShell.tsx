/**
 * SettingsShell — 设置管理界面一期(官方 SettingsRoot 对齐的外形与作用域)。
 * 分区:通用(外观三 cube + 语言,读 settings.describe / 写 settings.mutate,
 * 真后端可写且 revision 栅栏);模型(Provider 目录只读 + 模型计数,llm.providers/models);
 * 插件 / 插件清单(占位,下一期)。编辑 Provider 与插件配置留待下一期。
 * 入口:Sidebar 页脚齿轮(官方 sidebar.footer 设置座位)。
 */
import { useCallback, useEffect, useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-host-apiproxy/api'

type SectionId = 'general' | 'models' | 'plugins' | 'inventory'

const THEME_CHOICES = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
  { id: 'system', label: '跟随系统' },
] as const

// 应用主题偏好到 replica 文档(功能可用;视觉细节 Matrix 阶段细化)
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

  // 重新读取 settings.describe(写回后刷新 revision/值)。
  const reload = useCallback(async () => {
    setDescribeError(null)
    const res = await wire.api.settings.describe({})
    if (res.result.ok) setNamespaces(res.result.value.namespaces)
    else setDescribeError(res.result.error?.message ?? 'settings.describe failed')
  }, [wire])

  useEffect(() => {
    if (open) {
      void reload()
      const apply = (): void => {
        const theme = wire.api
        // 主题偏好应用到文档(尽力而为;不阻塞)。
        void theme.settings.describe({}).then((res) => {
          if (res.result.ok) {
            const ns = res.result.value.namespaces.find(n => n.ns === 'ui-theme')
            applyTheme((ns?.value as { preference?: string } | null)?.preference)
          }
        })
      }
      apply()
    } else {
      setWriteError(null)
    }
  }, [open, reload, wire])

  // Esc 关闭
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
                <p className="settings-hint">偏好经 settings.mutate 写入真后端(revision 栅栏);主题已即时应用到本页。</p>
              </div>
            )}

            {section === 'models' && <ModelsSection wire={wire} />}

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

/** 模型分区:Provider 目录只读 + 模型计数(llm.providers / llm.models)。 */
function ModelsSection({ wire }: { wire: ReturnType<typeof useRuntime>['wire'] }): JSX.Element {
  const [providers, setProviders] = useState<{ provider: string; displayName?: string; active: boolean; settingsNs?: string }[] | null>(null)
  const [groups, setGroups] = useState<{ name?: string; provider?: string; models?: unknown[] }[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [pRes, mRes] = await Promise.all([
        wire.api.llm.providers({}),
        wire.api.llm.models({}),
      ])
      if (cancelled) return
      if (pRes.result.ok) {
        setProviders(pRes.result.value.providers.map(p => ({
          provider: p.provider,
          displayName: p.displayName,
          active: p.active,
          settingsNs: p.settingsNs,
        })))
      } else {
        setError(pRes.result.error?.message ?? 'llm.providers failed')
      }
      if (mRes.result.ok) {
        setGroups(mRes.result.value.groups.map(g => ({
          name: g.name,
          provider: (g as unknown as { provider?: string }).provider,
          models: (g.models ?? []) as unknown[],
        })))
      }
    })()
    return () => { cancelled = true }
  }, [wire])

  const totalModels = groups.reduce((sum, g) => sum + (g.models?.length ?? 0), 0)

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">模型</h2>
      {error !== null && <p className="settings-error">{error}</p>}
      {providers === null ? (
        <p className="settings-hint">加载 Provider 目录…</p>
      ) : (
        <>
          <p className="settings-hint">
            共 {providers.length} 个可配置 Provider,{totalModels} 个模型(目录 count)。
          </p>
          <ul className="settings-provider-list">
            {providers.map(p => (
              <li key={p.provider} className="settings-provider-row">
                <span className="settings-provider-name">{p.displayName ?? p.provider}</span>
                <code className="settings-provider-key">{p.provider}</code>
                <span className={p.active ? 'settings-provider-state settings-provider-active' : 'settings-provider-state'}>
                  {p.active ? 'active' : 'idle'}
                </span>
                {p.settingsNs !== undefined && <code className="settings-provider-ns">{p.settingsNs}</code>}
                <button type="button" className="settings-provider-edit" disabled title="Provider 编辑下一期接入">
                  编辑
                </button>
              </li>
            ))}
          </ul>
          <p className="settings-hint">Provider/模型编辑(settings.mutate + credentials.set)下一期接入。</p>
        </>
      )}
    </div>
  )
}
