/**
 * TurnRail — 回合凝结雨轨(ZION 块 11 落地;算法与数值逐字照
 * ui-prototype/conversation/conversation-proto.html 块 11):
 * 26px 左轨 / 2 列迷你雨(11px Matrix Code,行距 12,步进 0.8,
 * 8% 亮头 rgba(194,255,217,0.7) / rgba(0,255,65,0.5),
 * destination-out rgba(0,0,0,0.14) 拖尾,帧节流 90/fx.speed);
 * active=false 卸载 canvas 凝 ◆ seal;reduced-motion 画一帧静态。
 * 纯装饰:aria-hidden + pointer-events:none(见 chat.css .rail)。
 * FX 读模块级对象(app/ambient-fx)直接 import,不经 React 订阅。
 * 字形取 matrixGlyphs.MATRIX_CHARS(超 Matrix Code cmap 会回退系统字体穿帮)。
 */
import { useEffect, useRef } from 'react'
import { fx } from '../app/ambient-fx.ts'
import { MATRIX_CHARS } from '../matrixGlyphs.ts'

const RAIL_FONT = '"Matrix Code", "Share Tech Mono", monospace'
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const rdec = (): string => MATRIX_CHARS[(Math.random() * MATRIX_CHARS.length) | 0]

export function TurnRail({ active }: { active: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) return
    const cv = canvasRef.current
    if (cv === null) return
    const ctx = cv.getContext('2d')
    if (ctx === null) return

    let w = 0
    let h = 0
    const drops = [Math.random() * -20, Math.random() * -20]
    const resize = (): void => {
      w = cv.width = cv.clientWidth
      h = cv.height = cv.clientHeight
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(cv)

    const paint = (): void => {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'
      ctx.font = `11px ${RAIL_FONT}`
      ctx.textAlign = 'center'
      for (let i = 0; i < 2; i++) {
        const y = drops[i] * 12
        ctx.fillStyle = Math.random() < 0.08 ? 'rgba(194,255,217,0.7)' : 'rgba(0,255,65,0.5)'
        ctx.fillText(rdec(), (w / 2) * i + w / 4, y)
        drops[i] = y > h + Math.random() * 300 ? 0 : drops[i] + 0.8
      }
    }
    if (REDUCED) {
      // reduced-motion:只绘制一帧静态雨轨
      paint()
      return () => observer.disconnect()
    }

    let last = 0
    let raf = 0
    const loop = (ts: number): void => {
      raf = requestAnimationFrame(loop)
      if (ts - last < 90 / fx.speed) return
      last = ts
      paint()
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [active])

  return (
    <div className={active ? 'rail' : 'rail settled'} aria-hidden="true">
      {active ? <canvas ref={canvasRef} /> : <span className="seal">◆</span>}
    </div>
  )
}
