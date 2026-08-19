/**
 * M3 — composer input bar (Q19A self-authored). textarea + Send/Stop,
 * a model selector (catalog from session.models, selection via selectModel),
 * image attachment intake guarded by the deployment imageLimits, and — since
 * functional wiring — a «+» button opening the slash-command list
 * (commands.list) whose selection fills the draft, with leading-«/» submit
 * dispatched to session.command (commands.execute) instead of a prompt.
 * Enter sends (queue mode); Shift+Enter for newline.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRuntime, type MediaType } from '../app/runtime.tsx'
import { ModelSelectAdapter } from '../app/model-select.tsx'
import { PermissionChip } from '../app/permission-ui.tsx'
import { PlanSeat } from '../app/plan-seat.tsx'
import { ContextMeterSeat, StatsLineSeat, TodoDockSeat } from '../app/composer-stats.tsx'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { GoalBar } from './GoalBar.tsx'
import type { PromptContentPart } from '../../vendor/client-connection/client/api.ts'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'

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
  const { wire, selectedSessionId, sendPrompt, stop, useConversation, imageLimits, runCommand, listCommands } = useRuntime()
  const running = useConversation(s => s.running)
  const promptError = useConversation(s => s.promptError)
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [intakeError, setIntakeError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commands, setCommands] = useState<readonly CommandDescriptor[]>([])
  const [commandsError, setCommandsError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const imageLimitError = useMemo(() => {
    if (images.length === 0) return null
    const total = images.reduce((acc, img) => acc + img.data.length, 0)
    const warnings: string[] = []
    if (images.length > imageLimits.maxImagesPerMessage) warnings.push(`最多 ${imageLimits.maxImagesPerMessage} 张`)
    if (total > imageLimits.maxMessageImageBytes) warnings.push(`总大小超限（${formatBytes(imageLimits.maxMessageImageBytes)}）`)
    return warnings.length > 0 ? warnings.join('；') : null
  }, [images, imageLimits])

  // Fetch the slash-command list when the «+» menu is first opened.
  useEffect(() => {
    if (!menuOpen || commands.length > 0 || commandsError !== null) return
    let cancelled = false
    void listCommands().then((items) => {
      if (cancelled) return
      setCommands(items)
    }).catch((error: unknown) => {
      if (cancelled) return
      setCommandsError(error instanceof Error ? error.message : String(error))
    })
    return () => { cancelled = true }
  }, [menuOpen, commands.length, commandsError, listCommands])

  const toggleMenu = (): void => setMenuOpen(prev => !prev)

  /** Insert the chosen command into the draft (trailing space when it takes input). */
  const pickCommand = (command: CommandDescriptor): void => {
    const token = `/${command.name}`
    setDraft(prev => {
      const base = prev.trim()
      const suffix = command.input === undefined ? '' : ' '
      return (base === '' ? token : `${base} ${token}`) + suffix
    })
    setMenuOpen(false)
    requestAnimationFrame(() => { textareaRef.current?.focus() })
  }

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
    // Slash-command line: dispatch to session.command, never as a prompt.
    if (text.startsWith('/')) {
      void runCommand(text)
      setDraft('')
      setImages([])
      return
    }
    const hasContent = text !== '' || images.length > 0
    if (!hasContent || imageLimitError !== null) return
    const parts: PromptContentPart[] = []
    if (text !== '') parts.push({ type: 'text', text })
    for (const img of images) {
      parts.push({ type: 'image', mediaType: img.mediaType, data: img.data, ...(img.name === undefined ? {} : { name: img.name }) })
    }
    sendPrompt(parts)
    setDraft('')
    setImages([])
  }

  return (
    <div className="input-bar">
      <SlotAnchor slot="conversation.input.dock" ownerProps={{}} />
      <TodoDockSeat />
      <GoalBar />
      <div className="input-bar-modes">
        <PermissionChip />
        <PlanSeat />
      </div>

      <div className="input-bar-model">
        {selectedSessionId === undefined ? (
          <span className="input-bar-model-fallback">模型</span>
        ) : (
          <ModelSelectAdapter wire={wire} sessionId={selectedSessionId} locked={running} />
        )}
      </div>

      <div className="input-bar-command" data-open={menuOpen || undefined}>
        <button
          type="button"
          className="input-bar-add"
          title="命令"
          aria-label="命令"
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          +
        </button>
        {menuOpen && (
          <div className="command-panel" role="listbox" aria-label="命令列表">
            {commandsError !== null && <div className="command-panel-error">{commandsError}</div>}
            {(commandsError === null && commands.length === 0) && (
              <div className="command-panel-hint">加载命令…</div>
            )}
            {commands.map(command => (
              <button
                key={command.name}
                type="button"
                className="command-panel-item"
                role="option"
                onClick={() => pickCommand(command)}
              >
                <span className="command-panel-name">/{command.name}</span>
                <span className="command-panel-desc">{command.description}</span>
              </button>
            ))}
          </div>
        )}
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

      <StatsLineSeat />

      <textarea
        ref={textareaRef}
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
          if (e.key === 'Escape' && menuOpen) setMenuOpen(false)
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
        <ContextMeterSeat />
        {running ? (
          <button className="input-bar-stop" type="button" onClick={() => stop()}>停止</button>
        ) : (
          <button className="input-bar-send" type="button" onClick={submit} disabled={(draft.trim() === '' && images.length === 0) || imageLimitError !== null}>发送</button>
        )}
      </div>
    </div>
  )
}
