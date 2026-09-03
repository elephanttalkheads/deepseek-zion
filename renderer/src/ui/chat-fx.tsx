/**
 * chat-fx — 会话区字形 FX 原子(块 12 沿用;算法与数值逐字照
 * ui-prototype/conversation/conversation-proto.html):
 * - MothCaret(块 12,§2.15):流式字形蛾光标(Matrix Code 随机字形 120ms
 *   扰码切换 + CSS mothblink 1.1s 呼吸 0.55↔1,70% 档;aria-hidden;
 *   reduced-motion = 静态 ▌ 不换字形)。
 * - AbortedMark(块 12):中断标记「 [已被操作员中断]」450ms 乱码逐位锁定
 *   (空格直通;reduced-motion 直出;.aborted danger 色见 chat.css)。
 * 字形单一事实源 = matrixGlyphs.MATRIX_CHARS(超 Matrix Code cmap 会回退
 * 系统字体穿帮)。帧写走 ref 直写 textContent(demo 同口径),不进 React 渲染路径。
 * (旧块 6 InjectDecode 已随 §2.6 ❯ 话头行定稿退役,2026-08-30。)
 */
import { useEffect, useRef } from 'react'
import { MATRIX_CHARS } from '../matrixGlyphs.ts'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const rdec = (): string => MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0]

/** 中断标记文案(源仓版,锁定决策不得改)。 */
const ABORT_TEXT = ' [已被操作员中断]'

/** 块 12:流式字形蛾光标(挂流式 assistant 末文本块尾)。 */
export function MothCaret(): JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null || REDUCED) return
    const timer = window.setInterval(() => {
      el.textContent = rdec()
    }, 120)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <span ref={ref} className="caret" aria-hidden="true">
      {REDUCED ? '▌' : rdec()}
    </span>
  )
}

/** 块 12:中断乱码锁定标记(挂 interrupted assistant 末文本块尾)。 */
export function AbortedMark(): JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    if (REDUCED) {
      el.textContent = ABORT_TEXT
      return
    }
    const chars = [...ABORT_TEXT]
    const start = performance.now()
    const dur = 450
    let raf = 0
    const step = (now: number): void => {
      const p = (now - start) / dur
      if (p >= 1) {
        el.textContent = ABORT_TEXT
        return
      }
      const locked = Math.floor(p * chars.length)
      el.textContent = chars.map((c, i) => (i < locked || c === ' ' ? c : rdec())).join('')
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  return <span ref={ref} className="aborted" />
}
