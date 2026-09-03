/**
 * StatusIcon — DESIGN.md §2.5 SET D 字形舱位状态图标原子组件。
 * 五枚闭集(12×12 内联 SVG,1px stroke,currentColor,方角):
 *   run  = Matrix Code 扰码(120ms JS 换字,与数字雨同族;reduced-motion 静态单字)
 *   wait = 沙漏(上半舱填充)
 *   idle = 空舱(发丝方框)
 *   done = 锁定舱 + 发丝勾
 *   err  = 故障切片(同一字形上下半错位;唯一语义红,颜色由落点 token 给)
 * SVG path 与扰码循环照抄 ui-prototype/composite-tui/composite-tui-proto.html
 * 的 ICON{run/wait/idle/done} + glitchSvg();扰码字符集走 matrixGlyphs.ts 的
 * MATRIX_CHARS(Matrix Code cmap 白名单,超集会回退系统字体穿帮)。
 * 语义零改动:纯渲染原子,状态映射由各落点既有逻辑给出。
 */
import { useEffect, useId, useState } from 'react'
import { MATRIX_CHARS } from '../matrixGlyphs.ts'

export type StatusIconKind = 'run' | 'wait' | 'idle' | 'done' | 'err'

const MX_FONT = '"Matrix Code","Share Tech Mono",monospace'

/** run:Matrix Code 扰码字形,120ms 随机换字;reduced-motion 冻结为初始字。 */
function RunGlyph(): JSX.Element {
  const [char, setChar] = useState('ア')
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setChar(MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0])
    }, 120)
    return () => window.clearInterval(timer)
  }, [])
  return <text x="6" y="9.2" textAnchor="middle" fontFamily={MX_FONT} fontSize="9" fill="currentColor">{char}</text>
}

/** err:故障切片(同一 Matrix 字形上下半错位;uid 隔离 clipPath id)。 */
function ErrGlyph({ uid }: { uid: string }): JSX.Element {
  return (
    <>
      <clipPath id={`${uid}t`}><rect x="0" y="0" width="12" height="5.5" /></clipPath>
      <clipPath id={`${uid}b`}><rect x="0" y="5.5" width="12" height="6.5" /></clipPath>
      <text x="6.9" y="9.2" textAnchor="middle" fontFamily={MX_FONT} fontSize="9" fill="currentColor" clipPath={`url(#${uid}t)`}>メ</text>
      <text x="5.1" y="9.2" textAnchor="middle" fontFamily={MX_FONT} fontSize="9" fill="currentColor" clipPath={`url(#${uid}b)`}>メ</text>
    </>
  )
}

export function StatusIcon({ kind, className }: { kind: StatusIconKind; className?: string }): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <svg
      className={className === undefined ? 'status-icon' : `status-icon ${className}`}
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      {kind === 'run' && <RunGlyph />}
      {kind === 'wait' && (
        <>
          <path d="M2.8 1.8 H9.2 M2.8 10.2 H9.2 M3.7 1.8 L8.3 10.2 M8.3 1.8 L3.7 10.2" fill="none" stroke="currentColor" />
          <path d="M4.7 3.1 L7.3 3.1 L6 5.3 Z" fill="currentColor" />
        </>
      )}
      {kind === 'idle' && (
        <rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="0.9" />
      )}
      {kind === 'done' && (
        <>
          <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" />
          <path d="M3.7 6.3 L5.4 8 L8.5 4.1" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </>
      )}
      {kind === 'err' && <ErrGlyph uid={uid} />}
    </svg>
  )
}
