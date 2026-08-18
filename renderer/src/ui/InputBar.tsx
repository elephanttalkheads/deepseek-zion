/**
 * M3 — composer input bar (Q19A self-authored). textarea + Send/Stop,
 * a model selector (catalog from session.models, selection via selectModel),
 * and image attachment intake guarded by the deployment imageLimits.
 * Enter sends (queue mode); Shift+Enter for newline.
 */
import { useMemo, useRef, useState } from 'react'
import { useRuntime, type MediaType } from '../app/runtime.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import type { PromptContentPart } from '../../vendor/client-connection/client/api.ts'

interface PendingImage {
  mediaType: MediaType
  data: string // base64 (no data: prefix)
  name?: string
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function InputBar(): JSX.Element {
  const { sendPrompt, stop, useConversation, models, selectModel, imageLimits } = useRuntime()
  const running = useConversation(s => s.running)
  const promptError = useConversation(s => s.promptError)
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [intakeError, setIntakeError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const imageLimitError = useMemo(() => {
    if (images.length === 0) return null
    const total = images.reduce((acc, img) => acc + img.data.length, 0)
    const warnings: string[] = []
    if (images.length > imageLimits.maxImagesPerMessage) warnings.push(`最多 ${imageLimits.maxImagesPerMessage} 张`)
    if (total > imageLimits.maxMessageImageBytes) warnings.push(`总大小超限（${formatBytes(imageLimits.maxMessageImageBytes)}）`)
    return warnings.length > 0 ? warnings.join('；') : null
  }, [images, imageLimits])

  const readFiles = (files: FileList | null): void => {
    if (files === null || files.length === 0) return
    const accepted = imageLimits.mediaTypes
    const file = files[0] as File
    if (!accepted.includes(file.type as MediaType)) {
      setIntakeError(`不支持的图片类型：${file.type || '(未知)'}`)
      return
    }
    if (file.size > imageLimits.maxImageBytes) {
      setIntakeError(`单张超过限额（${formatBytes(imageLimits.maxImageBytes)}）：${file.name}`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = String(reader.result ?? '').split(',')[1] ?? ''
      setImages(prev => [...prev, { mediaType: file.type as MediaType, data: base64, name: file.name }])
      setIntakeError(null)
    }
    reader.onerror = () => setIntakeError('读取图片失败')
    reader.readAsDataURL(file)
  }

  const submit = (): void => {
    const text = draft.trim()
    const hasContent = text !== '' || images.length > 0
    if (!hasContent || imageLimitError !== null) return
    if (text !== '' && images.length > 0) {
      setIntakeError(null)
    }
    const parts: PromptContentPart[] = []
    if (text !== '') parts.push({ type: 'text', text })
    for (const img of images) {
      parts.push({ type: 'image', mediaType: img.mediaType, data: img.data, ...(img.name === undefined ? {} : { name: img.name }) })
    }    sendPrompt(parts)
    setDraft('')
    setImages([])
  }

  const currentModel = models?.current
  const groups = models?.groups ?? []

  return (
    <div className="input-bar">
      <SlotAnchor slot="conversation.input.dock" ownerProps={{}} />
      <div className="input-bar-model" title={currentModel === undefined ? '加载模型中…' : `${currentModel.provider}/${currentModel.model}`}>
        <label className="input-bar-model-label" htmlFor="model-select">模型</label>
        <select
          id="model-select"
          className="input-bar-model-select"
          value={currentModel === undefined ? '' : `${currentModel.provider}/${currentModel.model}`}
          onChange={(e) => {
            const [provider, ...rest] = e.target.value.split('/')
            const model = rest.join('/')
            if (provider !== undefined && model !== '') selectModel({ provider, model })
          }}
          aria-label="Select model"
        >
          {currentModel === undefined && <option value="">加载中…</option>}
          {groups.map(group => (
            <optgroup key={group.id} label={group.name}>
              {group.models.map(m => (
                <option key={m.id} value={`${group.id}/${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {images.length > 0 && (
        <div className="input-bar-images" data-count={images.length}>
          {images.map((img, idx) => (
            <span key={`${img.name ?? idx}-${img.data.slice(0, 8)}`} className="input-bar-image-chip" title={img.name}>
              <img src={`data:${img.mediaType};base64,${img.data}`} alt={img.name ?? 'attachment'} className="input-bar-image-thumb" />
              <span className="input-bar-image-name">{img.name ?? `${idx + 1}`}</span>
              <button type="button" className="input-bar-image-remove" aria-label="移除图片" onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}>×</button>
            </span>
          ))}
        </div>
      )}
      {(imageLimitError !== null || intakeError !== null) && (
        <div className="input-bar-error">{imageLimitError ?? intakeError}</div>
      )}

      <textarea
        className="input-bar-textarea"
        placeholder="输入消息…"
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!running) submit()
          }
        }}
        onPaste={(e) => { readFiles(e.clipboardData?.files ?? null) }}
        aria-label="Message input"
      />
      {promptError !== null && <div className="input-bar-error">{String(promptError)}</div>}
      <div className="input-bar-foot">
        <button className="input-bar-attach" type="button" title="添加图片" onClick={() => fileRef.current?.click()}>
          📎
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={imageLimits.mediaTypes.join(',')}
          multiple={false}
          hidden
          onChange={(e) => { readFiles(e.target.files); e.target.value = '' }}
        />
        {running ? (
          <button className="input-bar-stop" type="button" onClick={() => stop()}>停止</button>
        ) : (
          <button className="input-bar-send" type="button" onClick={submit} disabled={(draft.trim() === '' && images.length === 0) || imageLimitError !== null}>发送</button>
        )}
      </div>
    </div>
  )
}
