/**
 * Toast 最小等位实现(ui-model-selection 的选中被拒提示等用)。
 * 官方为锚定 composer 卡的瞬态提示条;这里做固定底部瞬态 Toast,超时自动消失后回调
 * onDone。视觉细节整包 vendor 时替换。
 */
import { useEffect, useState } from 'react'

export interface ToastProps {
  /** 提示文本。 */
  text: string
  /** 可选前置图标节点。 */
  icon?: React.ReactNode
  /** 锚点元素(官方锚到 composer 卡);等位实现忽略定位,固定底部。 */
  anchor?: HTMLElement | null
  /** 消失/关闭后的回调。 */
  onDone?: () => void
  /** 显示时长(ms)。 */
  durationMs?: number
}

/** 固定底部瞬态 Toast:渲染后到达时长自动 onDone 收走。 */
export function Toast({ text, icon, onDone, durationMs = 3000 }: ToastProps): JSX.Element {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => {
      setLeaving(true)
      const end = setTimeout(() => { onDone?.() }, 160)
      return () => clearTimeout(end)
    }, durationMs)
    return () => clearTimeout(timer)
  }, [durationMs, onDone])

  return (
    <div className={`toast ${leaving ? 'toast-leaving' : ''}`.trim()} role="status">
      {icon !== undefined && <span className="toast-icon">{icon}</span>}
      <span className="toast-text">{text}</span>
    </div>
  )
}
