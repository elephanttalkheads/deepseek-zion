/**
 * ReplyActionBar — 回复尾操作条(DESIGN.md §2.14,C10 修订二定案;
 * 形态基准 ui-prototype/msg-action-icons/reply-actions-proto.html V1 与
 * ui-prototype/composite-tui/composite-tui-proto.html 的 .abar):
 * 固定在每轮已结束回复底部(turn-tail),复制 / 好的回答 / 有问题的回答 /
 * 分支四枚 13px 直角细线图标常显 40% 档,hover 升 100%,已赞/已踩激活 100%;
 * meta(HH:MM · 用时 · 首 token · tok/s)40% 档 tabular-nums 随行。
 * 数据面零改动:复制 = vendor writeClipboard(check-swap 反馈同官方);
 * 分支 = forkSession(anchorSeq),branchUnavailable 置灰 20% 档不可点;
 * 赞/踩 = MessageFeedbackSeat(官方 messageFeedback 契约,仅拇指视觉替换)。
 * meta 文案与换算照抄 vendor MessageIconActions(message-chrome.ts +
 * conversation 字典 message.ranFor/ttft/tokensPerSecond)。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip, writeClipboard } from '../../vendor/ui-primitives/index.ts'
import { IconCheckOutline16 } from '../../vendor/ui-primitives/icons/index.tsx'
import {
  formatLatencySeconds, formatMessageClock, formatRunDuration, formatTokensPerSecond,
} from '../../vendor/client-ui-conversation/client/chat/message-chrome.ts'
import { useCalendarDay } from '../../vendor/client-ui-conversation/client/chat/use-calendar-day.ts'
import type { MessageActionsTranslate } from '../../vendor/client-ui-conversation/client/chat/MessageIconActions.tsx'
import { BranchIcon, CopyIcon } from './reply-icons.tsx'

export interface ReplyActionBarProps {
  /** 复制按钮写入剪贴板的纯文本(closing.blocks 的 text 块)。 */
  text: string
  /** 回合结束事件时间(host epoch ms);缺失时整段 meta 省略(官方同口径)。 */
  time?: number | undefined
  /** 回合墙钟 ms(turn.start→end),追加「· 用时 X」。 */
  runMs?: number | undefined
  /** 首步 TTFT ms,追加「· 首 token X秒」。 */
  ttftMs?: number | undefined
  /** 解码吞吐,追加「· N tok/s」。 */
  tokensPerSecond?: number | undefined
  /** 在此消息处分支(forkSession);省略则不渲染分支钮。 */
  onBranch?: (() => void) | undefined
  /** 非已完成轮次末尾:分支钮可见但置灰不可点。 */
  branchUnavailable?: boolean | undefined
  /** 赞/踩反馈座(MessageFeedbackSeat;官方 extraActions 位)。 */
  feedback?: ReactNode
  /** conversation 字典翻译座。 */
  t: MessageActionsTranslate
}

export function ReplyActionBar({
  text, time, runMs, ttftMs, tokensPerSecond, onBranch, branchUnavailable = false, feedback, t,
}: ReplyActionBarProps): JSX.Element {
  const day = useCalendarDay()
  const reasonId = useRef(`ra-${Math.random().toString(36).slice(2)}`).current
  // check-swap 复制反馈照抄 vendor MessageIconActions(短窗口防连点/叠计时器)。
  const [copied, setCopied] = useState(false)
  const copyPending = useRef(false)
  const copyTimer = useRef<number | null>(null)
  const copyEpoch = useRef(0)
  useEffect(() => () => {
    copyEpoch.current += 1
    copyPending.current = false
    if (copyTimer.current !== null) clearTimeout(copyTimer.current)
  }, [])
  const onCopy = useCallback(() => {
    if (copied || copyPending.current) return
    const epoch = copyEpoch.current
    copyPending.current = true
    void writeClipboard(text).then((ok) => {
      if (epoch !== copyEpoch.current) return
      copyPending.current = false
      if (!ok) return
      setCopied(true)
      copyTimer.current = window.setTimeout(() => {
        copyTimer.current = null
        setCopied(false)
      }, 1000)
    })
  }, [copied, text])

  const meta = time === undefined ? null : (
    <span className="ra-meta">
      {formatMessageClock(time, t, day)}
      {runMs !== undefined && <> · {t('message.ranFor', { duration: formatRunDuration(runMs, t) })}</>}
      {ttftMs !== undefined && <> · {t('message.ttft', { seconds: formatLatencySeconds(ttftMs) })}</>}
      {tokensPerSecond !== undefined && <> · {t('message.tokensPerSecond', { tps: formatTokensPerSecond(tokensPerSecond) })}</>}
    </span>
  )

  return (
    <div className="reply-actions">
      <Tooltip label={copied ? t('copied') : t('copy')} side="bottom">
        <button type="button" className="ra" aria-label={copied ? t('copied') : t('copy')} onClick={onCopy}>
          {copied ? <IconCheckOutline16 /> : <CopyIcon />}
        </button>
      </Tooltip>
      {feedback}
      {onBranch !== undefined && (
        <Tooltip label={branchUnavailable ? t('message.branchUnavailable') : t('message.branch')} side="bottom">
          {/* 原生 disabled 不派发 hover/focus,Tooltip 需要事件:aria-disabled + 拦截点击。 */}
          <button
            type="button"
            className="ra"
            aria-label={t('message.branch')}
            aria-disabled={branchUnavailable || undefined}
            aria-describedby={branchUnavailable ? reasonId : undefined}
            data-unavailable={branchUnavailable || undefined}
            onClick={branchUnavailable ? undefined : onBranch}
          >
            <BranchIcon />
          </button>
        </Tooltip>
      )}
      {onBranch !== undefined && branchUnavailable && (
        <span id={reasonId} className="ra-visually-hidden">{t('message.branchUnavailable')}</span>
      )}
      {meta}
    </div>
  )
}
