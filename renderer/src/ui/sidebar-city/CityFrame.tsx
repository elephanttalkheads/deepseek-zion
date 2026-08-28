/**
 * CityFrame — ASCII 城市画布 + 投影 DOM 层(决策记录:拆分 #3/#4)。
 * - Canvas(aria-hidden)只画氛围:背景/3D 雨/街道/建筑点云/Portal 投射口/景深雾;
 * - Projected DOM(district-marker / session-portal)是真实 button,每帧只写 style,
 *   重建走 React(model / activeIndex / 选中态变化时),不在帧循环里 setState;
 * - rAF 主循环:camera.tick → renderCanvas → 投影层定位;字体就绪后才启动。
 */
import { useEffect, useMemo, useRef } from 'react'
import {
  BUILDING_HEIGHT, CITY_STATUS, PORTAL_LIFT, RAIN_CELL_H, RAIN_GLYPH_SX, RAIN_ZRANGE,
  buildRainColumns, clamp, createBuildingPoints, mix, projectPoint, rainColorAt, rgba, stableGlyph,
  type BuildingPoint, type CityWorkspace, type RainColumn3D,
} from './city-engine.ts'
import type { CityCamera } from './useCityCamera.ts'

interface CityFrameProps {
  model: CityWorkspace[]
  camera: CityCamera
  selectedSessionId: string | null
  total: number
  mapOpen: boolean
  onSelectSession: (id: string) => void
  onToggleMap: () => void
}

export function CityFrame({ model, camera, selectedSessionId, total, mapOpen, onSelectSession, onToggleMap }: CityFrameProps): JSX.Element {
  const frameRef = useRef<HTMLElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const coordinateRef = useRef<HTMLSpanElement | null>(null)
  const markerRefs = useRef(new Map<string, HTMLButtonElement>())
  const portalRefs = useRef(new Map<string, HTMLDivElement>())
  const dimsRef = useRef({ width: 280, height: 480, dpr: 1 })
  const modelRef = useRef(model)
  modelRef.current = model
  const activeRef = useRef(camera.activeIndex)
  activeRef.current = camera.activeIndex
  const buildingPoints = useMemo(() => model.map((ws, i) => createBuildingPoints(ws, i)), [model])
  const pointsRef = useRef(buildingPoints)
  pointsRef.current = buildingPoints
  const rainRef = useRef<RainColumn3D[] | null>(null)
  if (rainRef.current === null) rainRef.current = buildRainColumns()
  const rainPrevRef = useRef(0)

  const active = model[camera.activeIndex]

  // 滚轮/拖拽行走绑定。
  useEffect(() => {
    const el = frameRef.current
    if (el === null) return
    return camera.bindFrame(el)
  }, [camera])

  // Canvas 尺寸:ResizeObserver + DPR≤2。
  useEffect(() => {
    const el = frameRef.current
    const canvas = canvasRef.current
    if (el === null || canvas === null) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (ctx == null) return
    const resize = (): void => {
      const bounds = el.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      dimsRef.current = { width: Math.round(bounds.width), height: Math.round(bounds.height), dpr }
      canvas.width = Math.round(bounds.width * dpr)
      canvas.height = Math.round(bounds.height * dpr)
      canvas.style.width = `${Math.round(bounds.width)}px`
      canvas.style.height = `${Math.round(bounds.height)}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // rAF 主循环(字体就绪后启动;reduced 同样走循环,只是相机无平滑、雨冻结)。
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (canvas == null || ctx == null) return
    let raf = 0
    let prev = performance.now()
    const loop = (time: number): void => {
      const delta = Math.min(0.05, (time - prev) / 1000)
      prev = time
      camera.tick(delta)
      renderCanvas(ctx, time, camera, modelRef.current, activeRef.current, pointsRef.current, rainRef.current ?? [], dimsRef.current, rainPrevRef)
      updateProjectedDom(camera, modelRef.current, activeRef.current, markerRefs.current, portalRefs.current, dimsRef.current, coordinateRef.current)
      raf = requestAnimationFrame(loop)
    }
    let cancelled = false
    void document.fonts.load('12px "Matrix Code"').finally(() => {
      if (!cancelled) raf = requestAnimationFrame(loop)
    })
    return () => { cancelled = true; cancelAnimationFrame(raf) }
  }, [camera])

  return (
    <section className="city-frame" ref={frameRef} aria-label="可行走的工作区城市" data-experience={camera.reduced ? 'reduced' : 'cinematic'}>
      <canvas ref={canvasRef} className="city-canvas" aria-hidden="true" />
      <div className="frame-chrome" aria-hidden="true">
        <div className="frame-topline">
          <span className="frame-label">W/S WALK · A/D STRAFE</span>
          <span className="frame-coordinate" ref={coordinateRef}>Z:0000</span>
        </div>
        <div className="crosshair" />
      </div>
      <div className="projection-layer" aria-label="工作区地标">
        {model.map((ws, index) => (
          <button
            key={ws.id}
            type="button"
            className="district-marker"
            ref={(el) => { if (el !== null) markerRefs.current.set(ws.id, el); else markerRefs.current.delete(ws.id) }}
            style={{ '--workspace-color': ws.color } as React.CSSProperties}
            aria-label={`前往工作区 ${ws.name},${ws.sessions.length} 个会话`}
            onClick={() => camera.navigateToWorkspace(index)}
          >
            <span className="code">{ws.code}</span>
            <span className="name">{ws.name}</span>
            <span className="count">{String(ws.sessions.length).padStart(2, '0')}</span>
          </button>
        ))}
      </div>
      <div className="session-layer" aria-label="当前工作区会话入口">
        {active?.sessions.map((session, sessionIndex) => (
          <div
            key={session.id}
            className="sidebar-item session-portal-wrap"
            data-session-id={session.id}
            data-selected={selectedSessionId === session.id || undefined}
            data-running={session.status === 'streaming' || undefined}
            ref={(el) => { if (el !== null) portalRefs.current.set(session.id, el); else portalRefs.current.delete(session.id) }}
          >
            <button
              type="button"
              className="session-portal sidebar-row"
              data-slot={String(sessionIndex + 1).padStart(2, '0')}
              style={{ '--status-color': CITY_STATUS[session.status].color } as React.CSSProperties}
              title={`${session.title} · ${CITY_STATUS[session.status].label} · ${session.time}`}
              aria-label={`${session.title},${CITY_STATUS[session.status].label},${session.time}`}
              onClick={() => onSelectSession(session.id)}
            >
              <span className="sidebar-row-title">{session.title}</span>
            </button>
          </div>
        ))}
      </div>
      <button className="map-toggle" type="button" aria-expanded={mapOpen} aria-controls="city-map" onClick={onToggleMap}>
        CITY INDEX
        <span className="key-hint">M · {total}</span>
      </button>
    </section>
  )
}

// ── 帧内绘制(全部只读相机/模型,直接写 canvas 与 DOM style)──

type Dims = { width: number; height: number; dpr: number }
type Ctx = CanvasRenderingContext2D

function renderCanvas(
  ctx: Ctx, time: number, camera: CityCamera, model: CityWorkspace[], activeIndex: number,
  buildingPoints: BuildingPoint[][], rainCols: RainColumn3D[], dims: Dims,
  rainPrevRef: React.MutableRefObject<number>,
): void {
  drawBackground(ctx, dims)
  drawRain3D(ctx, time, camera, rainCols, dims, rainPrevRef)
  drawStreet(ctx, time, camera, dims)
  drawBuildings(ctx, time, camera, model, activeIndex, buildingPoints, dims)
  drawPortalBeams(ctx, camera, model, activeIndex, dims)
  drawDepthFog(ctx, dims)
}

function drawBackground(ctx: Ctx, dims: Dims): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, dims.height)
  gradient.addColorStop(0, '#010705')
  gradient.addColorStop(0.48, '#020a06')
  gradient.addColorStop(1, '#010302')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, dims.width, dims.height)

  const horizon = dims.height / 2
  const haze = ctx.createRadialGradient(dims.width / 2, horizon, 0, dims.width / 2, horizon, dims.width * 0.72)
  haze.addColorStop(0, 'rgba(68,255,123,0.12)')
  haze.addColorStop(0.35, 'rgba(30,112,55,0.035)')
  haze.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, horizon - 100, dims.width, 210)
}

function drawRain3D(
  ctx: Ctx, time: number, camera: CityCamera, rainCols: RainColumn3D[], dims: Dims,
  rainPrevRef: React.MutableRefObject<number>,
): void {
  const dt = Math.min(0.05, (time - rainPrevRef.current) / 1000)
  rainPrevRef.current = time
  const reduced = camera.reduced
  const rainK = reduced ? 0 : 1 + camera.pose.current.motion * 0.8

  const visible: { col: RainColumn3D; depth: number; point: { x: number; scale: number } }[] = []
  for (const col of rainCols) {
    if (!reduced) {
      for (const d of col.drops) {
        d.y -= d.speed * col.speedK * rainK * dt
        if (d.y < 0) { d.y = col.height + Math.random() * 30; d.speed = RAIN_CELL_H * 5 }
      }
    }
    const depth = ((col.z - camera.pose.current.z) % RAIN_ZRANGE + RAIN_ZRANGE) % RAIN_ZRANGE + 20
    const point = projectPoint(col.x, 0, camera.pose.current.z + depth, camera.pose.current, dims.width, dims.height)
    if (point === null) continue
    if (point.x < -30 || point.x > dims.width + 30) continue
    visible.push({ col, depth, point })
  }
  visible.sort((a, b) => b.depth - a.depth)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let lastSize = 0
  for (const { col, depth, point } of visible) {
    const s = point.scale
    const size = Math.max(3, Math.min(20, Math.round(s * RAIN_CELL_H)))
    if (size !== lastSize) {
      ctx.font = `${size}px "Matrix Code"`
      lastSize = size
    }
    const fade = clamp(1 - depth / 1500, 0.08, 1)
    const camEyeY = BUILDING_HEIGHT / 2

    ctx.save()
    ctx.translate(point.x, 0)
    ctx.scale(RAIN_GLYPH_SX, 1)
    for (let ci = 0; ci < col.cells; ci++) {
      if (depth > 500 && (ci & 1)) continue
      const y = ci * RAIN_CELL_H
      let b = 0.08
      for (const d of col.drops) {
        const dy = y - d.y
        if (dy >= 0 && dy < d.trail) b = Math.max(b, 1 - dy / d.trail)
      }
      if (depth > 900 && b < 0.3) continue
      const sy = dims.height / 2 - (col.y0 + y - camEyeY) * s
      if (sy < -16 || sy > dims.height + 16) continue
      const bright = b * fade
      const glyph = stableGlyph(col.seed + ci * 7 + Math.floor((reduced ? 0 : time) * 0.001 * (0.15 + bright * 0.45)))
      if (b > 0.8) {
        ctx.shadowColor = 'rgba(140,230,160,0.8)'
        ctx.shadowBlur = 8
        ctx.fillStyle = rainColorAt(Math.max(0.85, bright))
        ctx.fillText(glyph, 0, sy)
        ctx.shadowBlur = 0
      } else {
        ctx.globalAlpha = Math.min(1, bright * 1.15)
        ctx.fillStyle = rainColorAt(bright)
        ctx.fillText(glyph, 0, sy)
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }
}

function drawWorldLine(ctx: Ctx, camera: CityCamera, dims: Dims, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: string, width = 1): void {
  const start = projectPoint(a.x, a.y, a.z, camera.pose.current, dims.width, dims.height)
  const end = projectPoint(b.x, b.y, b.z, camera.pose.current, dims.width, dims.height)
  if (start === null || end === null) return
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}

function drawStreet(ctx: Ctx, time: number, camera: CityCamera, dims: Dims): void {
  ctx.font = '9px "Matrix Code"'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let distance = 42; distance < 1450; distance += 28) {
    const z = camera.pose.current.z + distance
    for (const [lane, x] of [-34, 0, 34].entries()) {
      const point = projectPoint(x, 0, z, camera.pose.current, dims.width, dims.height)
      if (point === null || point.y < 0 || point.y > dims.height + 16) continue
      const alpha = clamp(0.58 - distance / 2400, 0.06, 0.48)
      ctx.fillStyle = lane === 1
        ? `rgba(217,255,229,${alpha * 0.52})`
        : `rgba(57,255,115,${alpha})`
      const glyphSeed = distance + lane * 17 + Math.floor((camera.reduced ? 0 : time) / 280)
      ctx.fillText(stableGlyph(glyphSeed, lane === 1 ? ':*' : '|+'), point.x, point.y)
    }
  }

  const farZ = camera.pose.current.z + 1500
  for (const [index, x] of [-62, -34, 34, 62].entries()) {
    drawWorldLine(
      ctx, camera, dims,
      { x, y: 0, z: camera.pose.current.z + 24 },
      { x: x * 0.35, y: 0, z: farZ },
      index === 1 || index === 2 ? 'rgba(83,255,135,0.22)' : 'rgba(83,255,135,0.08)',
    )
  }
}

function drawBuildingShell(ctx: Ctx, camera: CityCamera, dims: Dims, workspace: CityWorkspace, workspaceIndex: number, activeIndex: number): void {
  const active = workspaceIndex === activeIndex
  const width = 100
  const height = BUILDING_HEIGHT
  const depth = 74
  const front = [
    projectPoint(workspace.x - width / 2, 0, workspace.z, camera.pose.current, dims.width, dims.height),
    projectPoint(workspace.x + width / 2, 0, workspace.z, camera.pose.current, dims.width, dims.height),
    projectPoint(workspace.x + width / 2, height, workspace.z, camera.pose.current, dims.width, dims.height),
    projectPoint(workspace.x - width / 2, height, workspace.z, camera.pose.current, dims.width, dims.height),
  ]
  const pts = front.filter((p): p is NonNullable<typeof p> => p !== null)
  if (pts.length < 4) return

  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (const point of pts.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.fillStyle = active ? rgba(workspace.color, 0.055) : 'rgba(3,14,8,0.09)'
  ctx.fill()
  ctx.strokeStyle = active ? rgba(workspace.color, 0.36) : 'rgba(69,181,100,0.12)'
  ctx.lineWidth = active ? 1 : 0.6
  ctx.stroke()

  const side = workspace.x < 0 ? width / 2 : -width / 2
  drawWorldLine(ctx, camera, dims,
    { x: workspace.x + side, y: 0, z: workspace.z },
    { x: workspace.x + side, y: 0, z: workspace.z + depth },
    rgba(workspace.color, active ? 0.38 : 0.15))
  drawWorldLine(ctx, camera, dims,
    { x: workspace.x + side, y: height, z: workspace.z },
    { x: workspace.x + side, y: height, z: workspace.z + depth },
    rgba(workspace.color, active ? 0.3 : 0.12))
}

function drawBuildings(ctx: Ctx, time: number, camera: CityCamera, model: CityWorkspace[], activeIndex: number, buildingPoints: BuildingPoint[][], dims: Dims): void {
  const drawable: { point: BuildingPoint; projected: { x: number; y: number; depth: number; scale: number }; workspace: CityWorkspace }[] = []

  model.forEach((workspace, workspaceIndex) => {
    drawBuildingShell(ctx, camera, dims, workspace, workspaceIndex, activeIndex)
    for (const point of buildingPoints[workspaceIndex]) {
      const projected = projectPoint(point.x, point.y, point.z, camera.pose.current, dims.width, dims.height)
      if (projected === null) continue
      if (projected.x < -12 || projected.x > dims.width + 12 || projected.y < -12 || projected.y > dims.height + 12) continue
      drawable.push({ point, projected, workspace })
    }
  })

  drawable.sort((a, b) => b.projected.depth - a.projected.depth)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (const { point, projected, workspace } of drawable) {
    const active = point.workspaceIndex === activeIndex
    const size = clamp(5.5 + projected.scale * 5.8, 5.8, 13.5)
    const depthFade = clamp(1 - projected.depth / 1700, 0.11, 0.88)
    const pulse = !camera.reduced && point.sessionIndex !== undefined
      ? 0.78 + Math.sin(time * 0.004 + point.sessionIndex) * 0.22
      : 1
    const alpha = depthFade * point.energy * (active ? 1 : 0.68) * pulse
    ctx.font = `${size}px "Matrix Code"`
    ctx.fillStyle = point.statusColor !== undefined
      ? rgba(point.statusColor, alpha)
      : rgba(workspace.color, alpha)
    ctx.fillText(point.glyph, projected.x, projected.y)
  }
}

/** Portal 投射口:建筑立面会话带中心的一小段高亮横线。 */
function drawPortalBeams(ctx: Ctx, camera: CityCamera, model: CityWorkspace[], activeIndex: number, dims: Dims): void {
  const workspace = model[activeIndex]
  if (workspace === undefined) return
  const buildingDepth = workspace.z - camera.pose.current.z
  if (buildingDepth < 56 || buildingDepth > 510) return
  const alphaScale = clamp(1.2 - Math.abs(buildingDepth - 225) / 370, 0.22, 1)

  workspace.sessions.forEach((session, sessionIndex) => {
    const y = 127 - sessionIndex * 21
    if (y < 0) return
    const back = projectPoint(workspace.x, y, workspace.z, camera.pose.current, dims.width, dims.height)
    if (back === null) return
    const color = CITY_STATUS[session.status].color
    ctx.strokeStyle = rgba(color, 0.5 * alphaScale)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(back.x - 6 * back.scale, back.y)
    ctx.lineTo(back.x + 6 * back.scale, back.y)
    ctx.stroke()
  })
}

function drawDepthFog(ctx: Ctx, dims: Dims): void {
  const fog = ctx.createLinearGradient(0, 0, 0, dims.height)
  fog.addColorStop(0, 'rgba(0,3,2,0.18)')
  fog.addColorStop(0.38, 'rgba(0,0,0,0)')
  fog.addColorStop(1, 'rgba(0,3,1,0.36)')
  ctx.fillStyle = fog
  ctx.fillRect(0, 0, dims.width, dims.height)
}

/** 投影 DOM 每帧定位:只写 style,不触发 React。 */
function updateProjectedDom(
  camera: CityCamera, model: CityWorkspace[], activeIndex: number,
  markers: Map<string, HTMLButtonElement>, portals: Map<string, HTMLDivElement>,
  dims: Dims, coordinate: HTMLSpanElement | null,
): void {
  const cam = camera.pose.current
  for (const [index, workspace] of model.entries()) {
    const marker = markers.get(workspace.id)
    if (marker === undefined) continue
    const point = projectPoint(workspace.x, 203, workspace.z, cam, dims.width, dims.height)
    if (point === null || point.depth > 1500 || point.x < -100 || point.x > dims.width + 100) {
      marker.style.opacity = '0'
      marker.style.pointerEvents = 'none'
      continue
    }
    const scale = clamp(point.scale, 0.58, 1.08)
    marker.style.left = `${point.x}px`
    marker.style.top = `${point.y}px`
    marker.style.opacity = String(clamp(1 - point.depth / 1750, 0.2, 0.96))
    marker.style.transform = `translate(-50%, -100%) scale(${scale})`
    marker.style.pointerEvents = 'auto'
    marker.classList.toggle('is-active', index === activeIndex)
  }

  const workspace = model[activeIndex]
  if (workspace !== undefined) {
    const buildingDepth = workspace.z - cam.z
    const centerAnchor = projectPoint(workspace.x, BUILDING_HEIGHT / 2, workspace.z - PORTAL_LIFT, cam, dims.width, dims.height)
    workspace.sessions.forEach((session, sessionIndex) => {
      const wrap = portals.get(session.id)
      if (wrap === undefined) return
      const y = 127 - sessionIndex * 21
      const point = projectPoint(workspace.x, y, workspace.z - PORTAL_LIFT, cam, dims.width, dims.height)
      if (point === null || y < 0 || buildingDepth < 56 || buildingDepth > 510) {
        wrap.style.opacity = '0'
        wrap.style.pointerEvents = 'none'
        return
      }
      const spread = clamp(1.5 / point.scale, 0.55, 1)
      const screenY = centerAnchor !== null ? centerAnchor.y + (point.y - centerAnchor.y) * spread : point.y
      if (screenY < 24 || screenY > dims.height - 50) {
        wrap.style.opacity = '0'
        wrap.style.pointerEvents = 'none'
        return
      }
      const scale = clamp(point.scale, 0.72, 1.04) * (1 + cam.motion * 0.1)
      const width = clamp(130 * scale + 28, 132, 182)
      wrap.style.width = `${width}px`
      wrap.style.left = `${point.x}px`
      wrap.style.top = `${screenY}px`
      const base = clamp(1.2 - Math.abs(buildingDepth - 225) / 370, 0.22, 1)
      wrap.style.opacity = String(mix(base, 1, cam.motion * 0.9))
      wrap.style.transform = `translate(-50%, -50%) scale(${scale})`
      wrap.style.pointerEvents = 'auto'
    })
  }

  if (coordinate !== null) {
    coordinate.textContent = `Z:${String(Math.round(cam.z + 100)).padStart(4, '0')} X:${Math.round(cam.x)}`
  }
}
