/**
 * useCityCamera — 相机状态与行走输入(决策记录:拆分 #2)。
 * camera/target 分离:常规逐帧平滑逼近,reduced-motion 直接到终态;
 * activeWorkspace(相机推导,决定 Portal 显示哪组)与 selectedSession(用户选择)不合并。
 * 行走输入:W/S/A/D + 方向键 / 滚轮 / 空白拖拽(用户裁决全部保留)。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CAMERA_STRAFE_RADIUS, clamp, mix,
  type CameraPose, type CityWorkspace,
} from './city-engine.ts'

export interface CityCamera {
  /** 每帧读写的相机引用(rAF 驱动,不进 React state)。 */
  pose: React.MutableRefObject<{ z: number; x: number; targetZ: number; targetX: number; motion: number }>
  /** 相机推导出的活跃工作区(低频变化,进 React state 驱动 Portal 重建)。 */
  activeIndex: number
  navigateToWorkspace: (index: number, snap?: boolean) => void
  moveCamera: (direction: 'forward' | 'back' | 'left' | 'right', amount?: number) => void
  /** 每帧调用:平滑逼近 + 运动能量 + 活跃工作区同步。 */
  tick: (delta: number) => void
  /** 绑定城市框架的滚轮/拖拽行走(返回解绑)。 */
  bindFrame: (el: HTMLElement) => () => void
  reduced: boolean
}

export function useCityCamera(model: CityWorkspace[], mapOpen: boolean): CityCamera {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const pose = useRef({ z: 0, x: model[0]?.x ?? 0, targetZ: 0, targetX: model[0]?.x ?? 0, motion: 0 })
  const [activeIndex, setActiveIndex] = useState(0)
  const activeRef = useRef(0)
  const modelRef = useRef(model)
  modelRef.current = model
  const mapOpenRef = useRef(mapOpen)
  mapOpenRef.current = mapOpen

  const lastZ = useCallback((): number => {
    const list = modelRef.current
    return list.length > 0 ? list[list.length - 1].z - 128 : 0
  }, [])

  const centerOn = useCallback((index: number, snap = false): void => {
    const ws = modelRef.current[index]
    if (ws === undefined) return
    pose.current.targetX = ws.x
    if (snap) pose.current.x = ws.x
  }, [])

  const navigateToWorkspace = useCallback((index: number, snap = false): void => {
    const ws = modelRef.current[index]
    if (ws === undefined) return
    activeRef.current = index
    setActiveIndex(index)
    pose.current.targetZ = ws.z - 230
    centerOn(index, snap || reduced)
    if (reduced) pose.current.z = pose.current.targetZ
  }, [centerOn, reduced])

  const moveCamera = useCallback((direction: 'forward' | 'back' | 'left' | 'right', amount = 76): void => {
    const p = pose.current
    if (direction === 'forward') p.targetZ += amount
    if (direction === 'back') p.targetZ -= amount
    if (direction === 'left') p.targetX -= 13
    if (direction === 'right') p.targetX += 13
    p.targetZ = clamp(p.targetZ, -15, lastZ())
    if (direction === 'left' || direction === 'right') {
      const center = modelRef.current[activeRef.current]?.x ?? 0
      p.targetX = clamp(p.targetX, center - CAMERA_STRAFE_RADIUS, center + CAMERA_STRAFE_RADIUS)
    }
    if (reduced) {
      p.z = p.targetZ
      p.x = p.targetX
    }
  }, [lastZ, reduced])

  const tick = useCallback((delta: number): void => {
    const p = pose.current
    const smoothing = reduced ? 1 : 1 - Math.pow(0.001, delta)
    const prevZ = p.z
    const prevX = p.x
    p.z = mix(p.z, p.targetZ, smoothing)
    p.x = mix(p.x, p.targetX, smoothing)
    const speed = Math.hypot(p.z - prevZ, p.x - prevX) / Math.max(delta, 0.001)
    const motionTarget = reduced ? 0 : clamp(speed / 260, 0, 1)
    p.motion = mix(p.motion, motionTarget, 1 - Math.pow(0.01, delta))
    // 活跃工作区 = 离相机最近的一栋(浏览位置,与用户选中无关)。
    let best = 0
    let bestDistance = Infinity
    modelRef.current.forEach((ws, index) => {
      const distance = Math.abs(p.z - (ws.z - 230))
      if (distance < bestDistance) { bestDistance = distance; best = index }
    })
    if (best !== activeRef.current) {
      activeRef.current = best
      setActiveIndex(best)
      centerOn(best, reduced)
    }
  }, [centerOn, reduced])

  const bindFrame = useCallback((el: HTMLElement): (() => void) => {
    const onWheel = (event: WheelEvent): void => {
      if (mapOpenRef.current) return
      event.preventDefault()
      const p = pose.current
      const amount = clamp(event.deltaY * 0.32, -105, 105)
      p.targetZ = clamp(p.targetZ + amount, -15, lastZ())
    }
    let dragging = false
    let px = 0
    let py = 0
    const onPointerDown = (event: PointerEvent): void => {
      if ((event.target as HTMLElement).closest('button')) return
      dragging = true
      px = event.clientX
      py = event.clientY
      el.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging) return
      const dx = event.clientX - px
      const dy = event.clientY - py
      px = event.clientX
      py = event.clientY
      const p = pose.current
      const center = modelRef.current[activeRef.current]?.x ?? 0
      p.targetX = clamp(p.targetX - dx * 0.23, center - CAMERA_STRAFE_RADIUS, center + CAMERA_STRAFE_RADIUS)
      p.targetZ = clamp(p.targetZ + dy * 0.72, -15, lastZ())
    }
    const onPointerUp = (event: PointerEvent): void => {
      dragging = false
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
    }
  }, [lastZ])

  // 键盘行走(W/S/A/D + 方向键;索引打开时暂停背景移动)。
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if ((event.target as HTMLElement).matches('input, textarea, [contenteditable]')) return
      if (mapOpenRef.current) return
      const directions: Record<string, 'forward' | 'back' | 'left' | 'right'> = {
        w: 'forward', arrowup: 'forward',
        s: 'back', arrowdown: 'back',
        a: 'left', arrowleft: 'left',
        d: 'right', arrowright: 'right',
      }
      const direction = directions[event.key.toLowerCase()]
      if (direction === undefined) return
      event.preventDefault()
      moveCamera(direction)
    }
    document.addEventListener('keydown', onKeydown)
    return () => document.removeEventListener('keydown', onKeydown)
  }, [moveCamera])

  // 工作区增删后相机越界校正。
  useEffect(() => {
    if (activeRef.current >= model.length) {
      activeRef.current = Math.max(0, model.length - 1)
      setActiveIndex(activeRef.current)
    }
    pose.current.targetZ = clamp(pose.current.targetZ, -15, lastZ())
  }, [model.length, lastZ])

  return { pose, activeIndex, navigateToWorkspace, moveCamera, tick, bindFrame, reduced }
}

export type { CameraPose }
