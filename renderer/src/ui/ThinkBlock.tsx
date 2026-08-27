/**
 * ThinkBlock — 思考块(ZION 块 7 落地;替换 vendor ReasoningRow 的自研等位):
 * <details.think> 原生折叠(默认折叠),summary = ▸ + 思路 + (streaming 时
 * 「· 思考中…」)+ 磁带纹横轨;think-body 按 \n 切行 .tl,沉降梯度纯 CSS
 * (nth-last-child 0.38/0.55/0.72/0.86/1,见 chat.css)。
 * 磁带纹算法逐字照 ui-prototype/conversation/conversation-proto.html 块 7
 * (照 agent-reply-rail-proto.html C 变体,几何横置:排布轴 y→x 每 5px 一条,
 * 竖划厚 1.4px 高 3~8px、y 偏 2+rand*4,2.2px/60ms 向右,W+4→-4 回卷重随机,
 * 6% 高亮簇,destination-out 0.10 拖尾);非流式画一帧静态
 * rgba(20,184,80,0.28) 满铺;reduced-motion 跑 30 步静态。
 */
import { useEffect, useRef } from 'react'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 磁带纹绘制:live=流式走带;非 live=静态满铺帧。返回清理函数。 */
function paintTape(cv: HTMLCanvasElement, live: boolean): () => void {
  const W = (cv.width = cv.clientWidth || 160)
  const H = (cv.height = cv.clientHeight || 14)
  const ctx = cv.getContext('2d')
  if (ctx === null) return () => {}
  const rows: { x: number; len: number; y: number; hot: boolean }[] = []
  // 横置:排布轴 y→x(每 5px 一条),划 横→竖(厚 1.4px,高 3~8px,y 向抖动 2~6)
  for (let x = 0; x < W; x += 5) {
    rows.push({ x, len: 3 + Math.random() * 5, y: 2 + Math.random() * 4, hot: Math.random() < 0.06 })
  }
  const step = (): void => {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
    for (const r of rows) {
      r.x += 2.2 // 向右走带(顺读向),拖尾在左侧
      if (r.x > W + 4) {
        r.x = -4
        r.len = 3 + Math.random() * 5
        r.y = 2 + Math.random() * 4
        r.hot = Math.random() < 0.06
      }
      ctx.fillStyle = r.hot ? 'rgba(194,255,217,0.8)' : 'rgba(0,255,65,0.4)'
      ctx.fillRect(r.x, r.y, 1.4, r.len)
    }
  }
  if (!live) {
    // 静态帧:闭环/非流式思考,同色 sealTape 口径(横置)
    for (let x = 0; x < W; x += 5) {
      ctx.fillStyle = 'rgba(20,184,80,0.28)'
      ctx.fillRect(x, 2 + Math.random() * 4, 1.4, 3 + Math.random() * 5)
    }
    return () => {}
  }
  if (REDUCED) {
    for (let i = 0; i < 30; i++) step()
    return () => {}
  }
  const timer = window.setInterval(step, 60)
  return () => window.clearInterval(timer)
}

export function ThinkBlock({ text, streaming }: { text: string; streaming: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (cv === null) return
    // streaming 翻转时重绘(走带 ↔ 静态满铺)
    return paintTape(cv, streaming)
  }, [streaming])

  return (
    <details className={streaming ? 'think streaming' : 'think'}>
      <summary>
        <span className="t-label">思路</span>
        {streaming && <span className="st-tag">· 思考中…</span>}
        <span className="tape-track" aria-hidden="true"><canvas ref={canvasRef} /></span>
      </summary>
      <div className="think-body">
        {text.split('\n').map((line, i) => (
          <span key={i} className="tl">{line}</span>
        ))}
      </div>
    </details>
  )
}
