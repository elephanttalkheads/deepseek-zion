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
import { makeT } from '../app/locale-common.ts'
import { zh as conversationZh } from '../../vendor/client-ui-conversation/client/locales.ts'
import {
  attachmentRailLabels, dropOverlayLabels, lightboxLabels, imageSizeText,
} from '../../vendor/client-ui-conversation/client/image-labels.ts'
import {
  AttachmentRail, DropOverlay, ImageLightbox,
  type AttachmentRailItem,
} from '../../vendor/ui-attachment/index.ts'
import { ModelSelectAdapter } from '../app/model-select.tsx'
import { PermissionChip } from '../app/permission-ui.tsx'
import { PlanSeat } from '../app/plan-seat.tsx'
import { ContextCapsule, StatsLineSeat } from '../app/composer-stats.tsx'
import { useTriggerPipeline } from '../app/trigger-menu.tsx'
import type { PickOutcome, TokenSpan } from '../../vendor/ui-input-trigger/client/index.ts'
import { SlotAnchor } from '../plugin/anchors.tsx'
import { GoalBar } from './GoalBar.tsx'
import { QueueDock } from './QueueDock.tsx'
import { TodoDock } from './TodoDock.tsx'
import { StatusIcon } from './status-icon.tsx'
import type { PromptContentPart } from '../../vendor/client-connection/client/api.ts'
import type { CommandDescriptor } from '@deepseek-ai/dsh-commands/types'

interface PendingImage {
  mediaType: MediaType
  data: string // base64 (no data: prefix)
  name?: string
}

/** conversation 字典 + common 词表投影翻译器(官方 locale 查链等位)。 */
const chatT = makeT(conversationZh as Record<string, string>)

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function InputBar(): JSX.Element {
  const { wire, selectedSessionId, sendPrompt, stop, useConversation, imageLimits, runCommand, listCommands } = useRuntime()
  const running = useConversation(s => s.running)
  const composerPhase = useConversation(s => s.composerPhase)
  const promptError = useConversation(s => s.promptError)
  const [draft, setDraft] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [intakeError, setIntakeError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commands, setCommands] = useState<readonly CommandDescriptor[]>([])
  const [commandsError, setCommandsError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const dragDepthRef = useRef(0)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // textarea 多行撑高(demo autosize 移植):按 scrollHeight 向上长,MAX_H(≈5 行)
  // 封顶后出滚动条。draft 任何变化(键入/命令回填/发送清空)都重算。
  const TEXTAREA_MAX_H = 22.5 * 5
  useEffect(() => {
    const el = textareaRef.current
    if (el === null) return
    el.style.height = 'auto'
    const capped = Math.min(el.scrollHeight, TEXTAREA_MAX_H)
    el.style.height = `${capped}px`
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_H ? 'auto' : 'hidden'
  }, [draft])

  // 触发菜单管线(`/` 命令/技能 + /permission popupSelect):draft 修订号供
  // pick 的 span CAS(官方输入机 draftRev 语义)。
  const draftRevRef = useRef(0)
  const applyOutcome = (outcome: PickOutcome, span: TokenSpan): void => {
    if (span.draftRev !== draftRevRef.current) return
    if (typeof outcome === 'object' && outcome !== null && 'text' in outcome) {
      draftRevRef.current += 1
      setDraft(prev => `${prev.slice(0, span.start)}${outcome.text}${prev.slice(span.end)}`)
    }
  }
  // popupSelect 结算后移除开壳令牌段(如 /permission)。
  const consumeToken = (span: TokenSpan): void => {
    if (span.draftRev !== draftRevRef.current) return
    draftRevRef.current += 1
    setDraft(prev => `${prev.slice(0, span.start)}${prev.slice(span.end)}`)
  }
  const trigger = useTriggerPipeline(applyOutcome, consumeToken)
  // track 去重:keyup 与 onChange 常带相同 draft/caret(Escape/方向键的 keyup
  // 会把刚关掉的菜单重新触发打开),相同快照跳过。
  const lastTrackRef = useRef<{ draft: string; caret: number } | null>(null)
  const trackNow = (draft: string, caret: number): void => {
    const prev = lastTrackRef.current
    if (prev !== null && prev.draft === draft && prev.caret === caret) return
    lastTrackRef.current = { draft, caret }
    trigger.track(draft, caret, draftRevRef.current)
  }

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

  // 整页文件拖放摄入(官方 DeepSeek Chat 行为等位):document 级监听,拖放任意处
  // 落图;文本拖拽无 'Files' 类型直接放行(保留原生拖文本进 textarea)。覆盖层
  // pointer-inert,不干扰 enter/leave 计数。
  const canAcceptDrop = selectedSessionId !== undefined
  useEffect(() => {
    const hasFiles = (event: globalThis.DragEvent): boolean =>
      event.dataTransfer?.types.includes('Files') ?? false
    const reset = (): void => {
      dragDepthRef.current = 0
      setDragActive(false)
    }
    const onDragEnter = (event: globalThis.DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepthRef.current += 1
      setDragActive(true)
    }
    const onDragOver = (event: globalThis.DragEvent): void => {
      if (!hasFiles(event) || event.dataTransfer === null) return
      event.preventDefault()
      event.dataTransfer.dropEffect = canAcceptDrop ? 'copy' : 'none'
    }
    const onDragLeave = (event: globalThis.DragEvent): void => {
      if (!hasFiles(event)) return
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) setDragActive(false)
      const leavingViewport = event.clientX <= 0 || event.clientY <= 0
        || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight
      if ((event.target === document.documentElement || event.target === document.body) && leavingViewport) reset()
    }
    const onDrop = (event: globalThis.DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      reset()
      if (!canAcceptDrop) return
      readFiles(event.dataTransfer?.files ?? null)
    }
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    window.addEventListener('dragend', reset)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', reset)
    }
  }, [canAcceptDrop, selectedSessionId])

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
    <div className="input-bar" data-composer-card>
      {trigger.render()}
      {/* conversation.input.dock 停靠排(官方 §1.3 语义):官方条目(todo 任务条 /
          goal 目标条 / queue 队列行[有排队才渲染])与插件条目同排纵向停靠。 */}
      <div className="input-bar-dock">
        <TodoDock />
        <GoalBar />
        <QueueDock />
        <SlotAnchor slot="conversation.input.dock" ownerProps={{}} />
      </div>
      {/* .micro 微簇单行(demo §13 形态):左 = 权限 chip + plan chip(数据与弹层
          行为不动,chip 视觉由 CSS 压缩);右 cluster = 模型名紧凑触发(菜单功能
          保留)+ 独立 mi-think 推理等级 + ctx 胶囊条/百分比 + 会话状态。 */}
      <div className="input-bar-modes">
        <PermissionChip />
        <PlanSeat />
        <span className="input-bar-modes-cluster">
          {selectedSessionId === undefined ? (
            <span className="input-bar-model-fallback">模型</span>
          ) : (
            <span className="input-bar-model">
              <ModelSelectAdapter wire={wire} sessionId={selectedSessionId} locked={running} />
            </span>
          )}
          <ContextCapsule />
          <span className="input-bar-state" data-running={running || undefined}>
            <StatusIcon kind={running ? 'run' : 'idle'} />
            {running ? (composerPhase === 'active' ? 'STREAMING' : 'RUNNING') : 'READY'}
          </span>
        </span>
      </div>

      {dragActive && (
        <DropOverlay
          disabled={!canAcceptDrop}
          labels={dropOverlayLabels(chatT, canAcceptDrop, {
            count: imageLimits.maxImagesPerMessage,
            size: imageSizeText(imageLimits.maxImageBytes),
          })}
        />
      )}
      {lightbox !== null && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          labels={lightboxLabels(chatT)}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* 输入盒(demo .input-box):上下发丝边框壳;附件缩略图在壳内顶部;
          + 📎 ❯ textarea 停止 发送 全部同一行(.input-row)。 */}
      <div className="input-box">
        {images.length > 0 && (
          <div className="input-bar-rail">
            <AttachmentRail<AttachmentRailItem>
              items={images.map((img, idx) => ({
                id: `img-${idx}`,
                previewUrl: `data:${img.mediaType};base64,${img.data}`,
                alt: img.name ?? String(idx + 1),
                removeLabel: `移除图片 ${img.name ?? String(idx + 1)}`,
              }))}
              labels={attachmentRailLabels(chatT)}
              onOpen={(item) => setLightbox({ src: item.previewUrl, alt: item.alt })}
              onRemove={(item) => {
                const idx = images.findIndex((_, i) => `img-${i}` === item.id)
                if (idx >= 0) setImages(prev => prev.filter((_, i) => i !== idx))
              }}
            />
          </div>
        )}
        <div className="input-row">
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
          <span className="input-bar-prompt" aria-hidden="true">❯</span>
          <textarea
            ref={textareaRef}
            className="input-bar-textarea"
            placeholder="输入消息…"
            rows={1}
            value={draft}
            onChange={(e) => {
              const value = e.target.value
              draftRevRef.current += 1
              setDraft(value)
              trackNow(value, e.target.selectionStart ?? value.length)
            }}
            onKeyUp={(e) => {
              // 光标移动(不改 draft)也要刷新触发检测;相同快照由 trackNow 去重。
              const el = e.currentTarget
              trackNow(el.value, el.selectionStart ?? el.value.length)
            }}
            onKeyDown={(e) => {
              // 触发菜单打开时先仲裁(↑/↓/Enter/Escape)。
              const key = e.key === 'ArrowUp' ? 'up'
                : e.key === 'ArrowDown' ? 'down'
                  : e.key === 'Enter' ? 'enter'
                    : e.key === 'Escape' ? 'escape'
                      : null
              if (key !== null) {
                const outcome = trigger.arbitrate(key, e.nativeEvent.isComposing)
                if (outcome === 'consumed' || outcome === 'pick-highlighted') {
                  e.preventDefault()
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                // 运行中也允许发送:提示进入队列模式(queue),官方 composer 同姿态。
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape' && menuOpen) setMenuOpen(false)
            }}
            onPaste={(e) => { readFiles(e.clipboardData?.files ?? null) }}
            aria-label="Message input"
          />
          {running && (
            <button className="input-bar-stop" type="button" title="停止" aria-label="停止" onClick={() => stop()}>✕</button>
          )}
          <button className="input-bar-send" type="button" title="发送" aria-label="发送" onClick={submit} disabled={(draft.trim() === '' && images.length === 0) || imageLimitError !== null}>↑</button>
        </div>
      </div>
      {(imageLimitError !== null || intakeError !== null) && (
        <div className="input-bar-error">{imageLimitError ?? intakeError}</div>
      )}
      {promptError !== null && <div className="input-bar-error">{String(promptError)}</div>}
      {/* StatsLine 会话统计条:位置按官方 = 输入盒(.input-box)之下;
          ContextMeter 环已按评审裁决移除(ui-change-log 2026-08-21)。 */}
      <div className="input-bar-statsline">
        <StatsLineSeat />
      </div>
    </div>
  )
}
