/**
 * useWorkspaceCityModel — 生产数据 → 城市空间模型(决策记录:拆分 #1)。
 * - 工作区 = District(账目序即街区序,z = 230 + i*340 单调稳定,x 左右交替);
 * - 会话 = 建筑立面 Portal:沿用官方 ui-workspace 可见性(origin !== 'subagent'、
 *   非 blank、非归档、搜索过滤),状态二态 running→streaming/ready(不伪造);
 * - 子会话(fork lineage,parentSessionId 命中可见行)嵌到父会话 children(caret);
 * - 无归属会话落「未分组」District(灰),与官方分组账目一致。
 */
import { useMemo } from 'react'
import { useRuntime } from '../../app/runtime.tsx'
import type { SessionListEntry } from '../../../vendor/client-runtime/client/sessions/lineage.ts'
import type { CitySession, CityWorkspace } from './city-engine.ts'

/** District 能量色调色板(源原型四色循环;未分组固定灰)。 */
const DISTRICT_COLORS = ['#42ff85', '#ff9e42', '#68e9dd', '#c6ff4a', '#ff7ad9', '#8fb7ff']
const UNGROUPED_COLOR = '#71977c'
const UNGROUPED_KEY = 'ungrouped'

function basename(p: string | undefined): string {
  if (p === undefined || p === '') return ''
  const norm = p.replace(/\\/g, '/')
  return norm.split('/').filter(Boolean).pop() ?? p
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时`
  const days = Math.floor(hours / 24)
  return `${days}天`
}

export interface CityModel {
  workspaces: CityWorkspace[]
  /** 全部可见会话(含子会话)总数,用于 CITY INDEX 计数。 */
  total: number
  /** sessionId → 所属工作区 id(LOCATE / 选中态用)。 */
  workspaceOf: Map<string, string>
}

export function useWorkspaceCityModel(query: string, orderBy: 'updated' | 'manual', selectedSessionId: string | null): CityModel {
  const { useSessions, workspaces, archivedSessionIds } = useRuntime()
  const items = useSessions(s => s.items)

  return useMemo(() => {
    const now = Date.now()
    const q = query.trim().toLowerCase()
    const archived = new Set(archivedSessionIds)
    // 官方 sessionVisible:origin !== 'subagent' + 非归档 + blank 仅当前(新会话/fork 子代被选中时可见)。
    const visible = items.filter(entry =>
      entry.origin !== 'subagent' && !archived.has(entry.sessionId) &&
      (!entry.blank || entry.sessionId === selectedSessionId) &&
      (q === '' || (entry.title ?? '').toLowerCase().includes(q) || entry.sessionId.toLowerCase().includes(q)),
    )
    const byId = new Map(visible.map(e => [e.sessionId, e]))

    const toCity = (entry: SessionListEntry): CitySession => ({
      id: entry.sessionId,
      title: entry.title ?? basename(entry.cwd) ?? 'Untitled session',
      time: relativeTime(entry.updatedAt, now),
      status: entry.running ? 'streaming' : 'ready',
      updatedAt: entry.updatedAt,
    })

    // 顶层行 = 父不可见的行;子行(fork lineage)挂到父 children。
    const topLevel = visible.filter(e => e.parentSessionId === undefined || !byId.has(e.parentSessionId))
    const childrenOf = new Map<string, CitySession[]>()
    for (const e of visible) {
      if (e.parentSessionId !== undefined && byId.has(e.parentSessionId)) {
        const list = childrenOf.get(e.parentSessionId) ?? []
        list.push(toCity(e))
        childrenOf.set(e.parentSessionId, list)
      }
    }
    const withChildren = (entry: SessionListEntry): CitySession => {
      const city = toCity(entry)
      const kids = childrenOf.get(entry.sessionId)
      if (kids !== undefined && kids.length > 0) city.children = kids
      return city
    }

    const workspaceOf = new Map<string, string>()
    const used = new Set<string>()
    const cityList: CityWorkspace[] = []
    let districtIndex = 0
    const place = (id: string, name: string, color: string, sessions: CitySession[]): void => {
      cityList.push({
        id,
        code: `D-${String(districtIndex + 1).padStart(2, '0')}`,
        name,
        color,
        x: districtIndex % 2 === 0 ? -52 : 54,
        z: 230 + districtIndex * 340,
        sessions,
      })
      districtIndex += 1
    }

    for (const ws of workspaces) {
      const ids = new Set(ws.sessionIds)
      const members = topLevel.filter(e => ids.has(e.sessionId))
      if (members.length === 0) continue
      for (const m of members) used.add(m.sessionId)
      // 手动排序 → 工作区账目序;最近更新 → updatedAt 新→旧。
      const ordered = orderBy === 'manual'
        ? ws.sessionIds.map(id => members.find(m => m.sessionId === id)).filter((e): e is SessionListEntry => e !== undefined)
        : [...members].sort((a, b) => b.updatedAt - a.updatedAt)
      const sessions = ordered.map(withChildren)
      for (const s of sessions) {
        workspaceOf.set(s.id, ws.workspaceId)
        for (const c of s.children ?? []) workspaceOf.set(c.id, ws.workspaceId)
      }
      place(ws.workspaceId, ws.title, DISTRICT_COLORS[cityList.length % DISTRICT_COLORS.length], sessions)
    }

    const ungrouped = topLevel.filter(e => !used.has(e.sessionId))
    if (ungrouped.length > 0) {
      const ordered = orderBy === 'manual' ? ungrouped : [...ungrouped].sort((a, b) => b.updatedAt - a.updatedAt)
      const sessions = ordered.map(withChildren)
      for (const s of sessions) {
        workspaceOf.set(s.id, UNGROUPED_KEY)
        for (const c of s.children ?? []) workspaceOf.set(c.id, UNGROUPED_KEY)
      }
      place(UNGROUPED_KEY, '未分组', UNGROUPED_COLOR, sessions)
    }

    let total = 0
    for (const ws of cityList) for (const s of ws.sessions) total += 1 + (s.children?.length ?? 0)

    return { workspaces: cityList, total, workspaceOf }
  }, [items, workspaces, archivedSessionIds, query, orderBy, selectedSessionId])
}
