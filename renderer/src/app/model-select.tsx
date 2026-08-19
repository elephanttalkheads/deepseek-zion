/**
 * ModelSelectAdapter — 官方 ui-model-selection 的 ModelSelect 适配层。
 * 注入面:directory(共享 ModelDirectory store 每会话一个)、load、select(selectModel RPC)、
 * available(会话可用)、locked(运行中)、t(官方 zh 字典 + {param} 插值)。
 */
import { useEffect, useState } from 'react'
import type { ModelSelection, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { ModelSelect } from '../../vendor/ui-model-selection/client/ModelSelect.tsx'
import { ModelDirectory } from '../../vendor/ui-model-selection/client/directory.ts'
import { zh } from '../../vendor/ui-model-selection/client/locales.ts'
import type { AssembledWire } from '../protocol/assemble.ts'

/** 官方 zh 字典小型翻译器(NS 'model';支持 {param} 插值)。 */
function t(key: string, params?: Record<string, string | undefined>): string {
  let text = (zh as Record<string, string>)[key] ?? key
  if (params !== undefined) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, value ?? '')
    }
  }
  return text
}

export interface ModelSelectAdapterProps {
  wire: AssembledWire
  sessionId: SessionId
  /** 会话运行中(选择被锁)。 */
  locked: boolean
}

/** composer 模型席位:挂官方两列菜单(模型/推理等级)选择器。 */
export function ModelSelectAdapter({ wire, sessionId, locked }: ModelSelectAdapterProps): JSX.Element {
  const [directory] = useState(
    () => new ModelDirectory(
      wire.api.sessions as Pick<typeof wire.api.sessions, 'models' | 'selectModel'>,
      sessionId,
      () => true,
    ),
  )
  // 挂载即拉取目录;为保持与官方一致,首次展示即触发 load。
  useEffect(() => {
    void directory.load().catch(() => { /* 目录加载失败由菜单内 Retry 兜底 */ })
  }, [directory])

  const select = async (selection: ModelSelection): Promise<boolean> => {
    try {
      await directory.select(selection)
      return true
    } catch {
      return false
    }
  }

  return (
    <ModelSelect
      locked={locked}
      available={true}
      directory={directory.store}
      load={() => { void directory.load().catch(() => { /* noop */ }) }}
      select={select}
      t={t as never}
    />
  )
}
