/**
 * city-engine — ASCII 会话城的纯函数层(framework-free)。
 * 移植自 pi-martix-ui-dev ui-demo/ascii-cyberpunk-sidebar-prototype.html 的几何与字形纪律:
 * - Matrix-Code.ttf 字形白名单(34 片假名 + 无 6 数字 + *+<>:|),canvas 文本不得越界;
 * - 建筑点云启动生成一次(stableGlyph 确定性种子,不闪烁),会话状态带 y = 127 - i*21;
 * - project() 投影公式 Canvas 与 Projected DOM 共用,建筑半高锚定画布垂直中线;
 * - 3D 世界锚定代码雨:雨柱世界坐标固定,相机行走 = 穿越雨幕,亮度场 → 24 档绿 LUT。
 * 语义纪律:canvas 只负责空间与氛围,不承载唯一可点击目标(DOM button 才是入口)。
 */

// Matrix-Code.ttf only maps this deliberate glyph set. Keep canvas text inside it.
export const MATRIX_GLYPHS = 'アウエオカキケコサシスセソタツテナニヌネハヒホマミムメモヤヨラリワー012345789*+<>:|'
export const ARCH_GLYPHS = '|<>:+*'
export const BUILDING_HEIGHT = 184
export const CAMERA_STRAFE_RADIUS = 30
/** Portal 从建筑立面浮起的世界距离:全息投影光束的锥长。 */
export const PORTAL_LIFT = 26

export const RAIN_ZRANGE = 1400
export const RAIN_CELL_H = 9
export const RAIN_GLYPH_SX = 0.55

/** 会话状态二态(决策记录 #2:只有 running 是真实数据源,不伪造 THINKING/TOOL/ERROR)。 */
export type CityStatus = 'ready' | 'streaming'
export const CITY_STATUS: Record<CityStatus, { label: string; color: string; glyph: string }> = {
  ready: { label: 'READY', color: '#42ff85', glyph: ':' },
  streaming: { label: 'STREAMING', color: '#68e9dd', glyph: '+' },
}

export interface CitySession {
  id: string
  title: string
  time: string
  status: CityStatus
  /** 排序时间戳(updatedAt,ms);updated 序 = 新→旧。 */
  updatedAt: number
  children?: CitySession[]
}

export interface CityWorkspace {
  id: string
  code: string
  name: string
  color: string
  x: number
  z: number
  sessions: CitySession[]
}

export interface BuildingPoint {
  x: number
  y: number
  z: number
  glyph: string
  energy: number
  workspaceIndex: number
  sessionIndex?: number
  statusColor?: string
}

export interface RainDrop { y: number; speed: number; trail: number }
export interface RainColumn3D {
  x: number
  y0: number
  z: number
  cells: number
  height: number
  drops: RainDrop[]
  speedK: number
  seed: number
}

/** 24 档绿色 LUT:暗部 #0e2f1a → 拖尾主体 #4e9e57,顶端 15% → 亮头 #a7e6b0。 */
export const RAIN_LUT: string[] = (() => {
  const lut: string[] = []
  for (let i = 0; i < 24; i++) {
    const b = i / 23
    let r: number, g: number, bl: number
    if (b < 0.85) {
      const k = b / 0.85
      r = 14 + (78 - 14) * k; g = 47 + (158 - 47) * k; bl = 26 + (87 - 26) * k
    } else {
      const k = (b - 0.85) / 0.15
      r = 78 + (167 - 78) * k; g = 158 + (230 - 158) * k; bl = 87 + (176 - 87) * k
    }
    lut.push(`rgb(${r | 0},${g | 0},${bl | 0})`)
  }
  return lut
})()

export function rainColorAt(b: number): string {
  return RAIN_LUT[Math.min(23, Math.max(0, Math.round(b * 23)))]
}

export function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 雨柱一次性生成(种子固定,刷新不洗牌)。 */
export function buildRainColumns(): RainColumn3D[] {
  const cols: RainColumn3D[] = []
  const rand = mulberry32(20260828)
  for (const side of [-1, 1]) {
    for (let i = 0; i < 40; i++) {
      const cells = 24 + Math.floor(rand() * 20)
      const height = cells * RAIN_CELL_H
      const drops: RainDrop[] = []
      const dropCount = 2 + Math.floor(rand() * 2)
      for (let d = 0; d < dropCount; d++) {
        drops.push({ y: rand() * height, speed: RAIN_CELL_H * 5, trail: 70 + rand() * 70 })
      }
      cols.push({
        x: side * (55 + rand() * 205),
        y0: -40 + rand() * 200,
        z: rand() * RAIN_ZRANGE,
        cells, height, drops,
        speedK: 0.85 + rand() * 0.3,
        seed: rand() * 1000,
      })
    }
  }
  return cols
}

export function stableGlyph(seed: number, alphabet: string = MATRIX_GLYPHS): string {
  const value = Math.abs(Math.sin(seed * 12.9898 + 78.233) * 43758.5453)
  return alphabet[Math.floor((value % 1) * alphabet.length)]
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  }
}

export function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex)
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`
}

/** 建筑点云:正面 13×22 网格 + 侧面 8 切片 + 每条会话一行 11 字形状态带。 */
export function createBuildingPoints(workspace: CityWorkspace, workspaceIndex: number): BuildingPoint[] {
  const points: BuildingPoint[] = []
  const width = 100
  const height = BUILDING_HEIGHT
  const depth = 74
  const xSteps = 13
  const ySteps = 22

  for (let yi = 0; yi <= ySteps; yi += 1) {
    const y = yi * (height / ySteps)
    for (let xi = 0; xi <= xSteps; xi += 1) {
      const x = -width / 2 + xi * (width / xSteps)
      const edge = xi === 0 || xi === xSteps || yi === 0 || yi === ySteps
      const windowBand = yi > 2 && yi < ySteps - 2 && yi % 3 !== 0 && xi > 1 && xi < xSteps - 1
      if (!edge && !windowBand && (xi + yi) % 4 !== 0) continue
      points.push({
        x: workspace.x + x,
        y,
        z: workspace.z,
        glyph: edge ? stableGlyph(xi + yi * 3 + workspaceIndex, '|<>+') : stableGlyph(xi * 7 + yi * 11 + workspaceIndex),
        energy: edge ? 0.92 : (windowBand ? 0.52 : 0.28),
        workspaceIndex,
      })
    }
  }

  for (let zi = 1; zi <= 8; zi += 1) {
    const z = workspace.z + zi * (depth / 8)
    for (let yi = 0; yi <= ySteps; yi += 2) {
      const y = yi * (height / ySteps)
      for (const [sideIndex, side] of [-width / 2, width / 2].entries()) {
        points.push({
          x: workspace.x + side,
          y,
          z,
          glyph: stableGlyph(zi * 17 + yi * 5 + sideIndex + workspaceIndex, ARCH_GLYPHS),
          energy: 0.42,
          workspaceIndex,
        })
      }
    }
  }

  workspace.sessions.forEach((session, sessionIndex) => {
    const y = 127 - sessionIndex * 21
    if (y < 0) return // 超出立面的会话不进点云(索引内仍可达)
    const status = CITY_STATUS[session.status]
    for (let xi = -5; xi <= 5; xi += 1) {
      points.push({
        x: workspace.x + xi * 7.2,
        y,
        z: workspace.z - 0.5,
        glyph: xi === -5 || xi === 5 ? status.glyph : stableGlyph(sessionIndex * 19 + xi + workspaceIndex),
        energy: 1,
        workspaceIndex,
        sessionIndex,
        statusColor: status.color,
      })
    }
  })

  return points
}

export interface CameraPose { z: number; x: number }
export interface Projected { x: number; y: number; depth: number; scale: number }

/** 唯一投影公式:depth<=18 不渲染;focal 随矮画布收缩、上限 232;建筑半高锚定中线。 */
export function projectPoint(
  x: number, y: number, z: number,
  camera: CameraPose, width: number, height: number,
): Projected | null {
  const depth = z - camera.z
  if (depth <= 18) return null
  const focal = Math.min(232, height * 0.49)
  const scale = focal / depth
  return {
    x: width / 2 + (x - camera.x) * scale,
    y: height / 2 - (y - BUILDING_HEIGHT / 2) * scale,
    depth,
    scale,
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount
}
