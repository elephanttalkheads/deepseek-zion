/**
 * ThinkBlock — 思考块(ZION 块 7 落地;替换 vendor ReasoningRow 的自研等位):
 * <details.think> 原生折叠(默认折叠),summary = ▸ + 思路 + (streaming 时
 * 「· 思考中…」)+ 磁带纹横轨;think-body 按 \n 切行 .tl,沉降梯度纯 CSS
 * (nth-last-child 0.38/0.55/0.72/0.86/1,见 chat.css)。
 * 磁带纹算法对齐 DESIGN.md §2.7,逐字照 ui-prototype/composite-tui/
 * composite-tui-proto.html 的磁带纹 painter(轨道 DNA 不变:14px 横轨、
 * 竖划 5px 间距、厚 1.4px、高 3~8px、y 偏 2+rand*4、60ms 帧、
 * destination-out rgba(0,0,0,0.10) 拖尾):
 * - live(流式)= V3 段落突发:漂移 1.3px/帧;每 1.2~2.5s 一次写脉冲——
 *   整段 3 倍速 6.6px/帧 × 9 帧(~0.54s)+ 前沿一道白热头
 *   rgba(194,255,217,0.8);W+4→-4 回卷重随机。
 * - closed(闭环)= V1 亮度慢波:竖划固定,波位 1.3px/帧扫过,σ22,
 *   alpha 0.16+0.39·exp(-d²)(峰值封顶 55%),无白热。
 * - reduced-motion = 静态冻结帧 rgba(20,184,80,0.28)。
 */
import { useEffect, useRef } from 'react'

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** 磁带纹绘制:live=V3 流式突发;非 live=V1 闭环慢波。返回清理函数。 */
function paintTape(cv: HTMLCanvasElement, live: boolean): () => void {
  const W = (cv.width = cv.clientWidth || 160)
  const H = (cv.height = cv.clientHeight || 14)
  const ctx = cv.getContext('2d')
  if (ctx === null) return () => {}
  // 横置:排布轴 y→x(每 5px 一条),划 横→竖(厚 1.4px,高 3~8px,y 向抖动 2~6)
  const rows: { x: number; len: number; y: number }[] = []
  for (let x = 0; x < W; x += 5) {
    rows.push({ x, len: 3 + Math.random() * 5, y: 2 + Math.random() * 4 })
  }
  const fade = (): void => {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    ctx.fillRect(0, 0, W, H)
    ctx.globalCompositeOperation = 'source-over'
  }
  if (REDUCED) {
    // 冻结帧(§2.7 reduced-motion/历史回放口径)
    for (const r of rows) {
      ctx.fillStyle = 'rgba(20,184,80,0.28)'
      ctx.fillRect(r.x, r.y, 1.4, r.len)
    }
    return () => {}
  }
  let step: () => void
  if (live) {
    // V3 段落突发:漂移 = 酝酿,脉冲 = 落笔
    let mode: 'drift' | 'burst' = 'drift'
    let burstTimer = 60 + Math.random() * 40
    step = () => {
      fade()
      if (--burstTimer <= 0) {
        if (mode === 'drift') {
          mode = 'burst'
          burstTimer = 9 // 9 帧 × 60ms ≈ 0.54s 脉冲
        } else {
          mode = 'drift'
          burstTimer = 20 + Math.random() * 22 // 1.2~2.5s
        }
      }
      const speed = mode === 'burst' ? 6.6 : 1.3
      for (const r of rows) {
        r.x += speed // 向右走带(顺读向),拖尾在左侧
        if (r.x > W + 4) {
          r.x = -4
          r.len = 3 + Math.random() * 5
          r.y = 2 + Math.random() * 4
        }
        ctx.fillStyle = 'rgba(0,255,65,0.4)'
        ctx.fillRect(r.x, r.y, 1.4, r.len)
      }
      if (mode === 'burst') {
        const edge = rows.reduce((m, r) => Math.max(m, r.x), -4)
        ctx.fillStyle = 'rgba(194,255,217,0.8)'
        ctx.fillRect(edge - 2, 1, 1.4, H - 2)
      }
    }
  } else {
    // V1 闭环慢波:竖划固定,亮度波扫过(呼吸即沉降)
    let w = -24
    step = () => {
      fade()
      w += 1.3
      if (w > W + 24) w = -24
      for (const r of rows) {
        const d = (r.x - w) / 22
        const amp = Math.exp(-d * d)
        ctx.fillStyle = `rgba(0,255,65,${0.16 + 0.39 * amp})`
        ctx.fillRect(r.x, r.y, 1.4, r.len)
      }
    }
  }
  const timer = window.setInterval(step, 60)
  return () => window.clearInterval(timer)
}

export function ThinkBlock({ text, streaming }: { text: string; streaming: boolean }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (cv === null) return
    // streaming 翻转时重绘(V3 突发 ↔ V1 慢波)
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
