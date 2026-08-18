/**
 * Plugin runtime 底座 — 附加型槽注册表 (Q17A/Q20A)。
 *
 * 契约对齐官方 SlotRegistry 的面(register/spec/inject),但只开放"附加型"
 * 槽(slot-catalog replaceRisk:'none' 的白名单)。root/conversation/sidebar
 * 主机位独占,插件注册到即 throw。
 *
 * - register 必须是原型方法(官方注释强调):guard 用 `register.call(target,…)`
 *   使 cordis 的 `this.ctx` 落在调用插件 fiber 上。这里只承接条目。
 * - list 槽按 order 升序;keyed 槽按 key 分派单元格;single 槽仅一个席位。
 */

export type SlotKind = 'single' | 'list' | 'keyed' | 'chain'

export interface SlotSpec { key: string; kind: SlotKind }

export interface RegisterOptions {
  name: string
  key?: string
  id?: string
  order?: number
  label?: string | (() => string)
  priority?: number
  [k: string]: unknown
}

export interface StoredEntry {
  options: RegisterOptions
  component: unknown
  /** Assigned shadowing priority (plugin runtime): later registrations win single/keyed. */
  priority: number
}

/** 附加型槽白名单(与 slot-catalog replaceRisk:'none' 对齐)。 */
export const ADDITIVE_SLOT_SPECS: Record<string, SlotKind> = {
  'shell.overlay': 'list',
  'conversation.chat.assistant-actions': 'list',
  'conversation.input.dock': 'list',
  'conversation.composer.dock': 'list',
  'conversation.input.left': 'list',
  'conversation.input.right': 'list',
  'conversation.input.overlay': 'list',
  'settings.action': 'list',
  'settings.general.item': 'list',
  'settings.onboarding': 'list',
  'settings.plugins.tab': 'list',
  'settings.section': 'list',
  'tool.call.toolview': 'keyed',
  'tool.view.cordis': 'keyed',
  'settings.plugin.item': 'keyed',
  'sidebar.footer.action': 'list',
}

/** 已发货的 toolview key(官方工具名)——动态插件注册这些 key 属于抢占,拒绝。 */
const SHIPPED_TOOLVIEW_KEYS = new Set([
  'bash', 'read', 'edit', 'write', 'grep', 'glob',
  'web_search', 'web_fetch', 'todo_write', 'ask_user_question',
])

export class SlotRegistry {
  #specs: Readonly<Record<string, SlotKind>>
  #entriesBySlot = new Map<string, StoredEntry[]>()
  #nextPriority = 0

  constructor(specs: Readonly<Record<string, SlotKind>> = ADDITIVE_SLOT_SPECS) {
    this.#specs = specs
  }

  spec(key: string): SlotSpec | undefined {
    const kind = this.#specs[key]
    return kind === undefined ? undefined : { key, kind }
  }

  /** Whether a slot key is host-owned and never open to plugins. */
  isHostSeat(key: string): boolean {
    return key === 'root' || key === 'conversation' || key === 'sidebar'
      || key === 'conversation.session' || key === 'details' || key === 'settings.close'
  }

  /** Register a component for one additive slot. Returns disposer. */
  register(options: RegisterOptions, component: unknown): () => void {
    const slot = options.name
    if (typeof slot !== 'string' || slot.length === 0) throw new Error('slot.register: options.name must be a non-empty slot key')
    if (this.isHostSeat(slot)) throw new Error(
      `slot "${slot}" is a host-owned seat and is not open to dynamic plugins (附加型槽 only).`,
    )
    const spec = this.spec(slot)
    if (spec === undefined) throw new Error(`slot "${slot}" is not in the additive slot allow-list`)
    if (spec.kind === 'keyed' && slot === 'tool.call.toolview') {
      const cell = options.key
      if (cell === undefined || SHIPPED_TOOLVIEW_KEYS.has(cell)) throw new Error(
        `tool.call.toolview key "${String(cell)}" is covered by the shipped UI — register your own tool name instead.`,
      )
    }
    const priority = this.#nextPriority++
    const entry: StoredEntry = { options: { ...options, priority }, component, priority }
    const list = this.#entriesBySlot.get(slot) ?? []
    list.push(entry)
    this.#entriesBySlot.set(slot, list)
    return () => {
      const cur = this.#entriesBySlot.get(slot) ?? []
      const at = cur.indexOf(entry)
      if (at !== -1) cur.splice(at, 1)
    }
  }

  /** List entries for a list slot, ascending order (stable insertion tiebreak). */
  entries(slot: string): readonly StoredEntry[] {
    return (this.#entriesBySlot.get(slot) ?? [])
      .slice()
      .sort((a, b) => (a.options.order ?? 0) - (b.options.order ?? 0) || a.priority - b.priority)
  }

  /** Single/keyed winner (highest priority = last registered wins). */
  winner(slot: string, key?: string): StoredEntry | undefined {
    const list = this.#entriesBySlot.get(slot) ?? []
    if (list.length === 0) return undefined
    if (key !== undefined) {
      const hit = list.find(e => e.options.key === key)
      return hit ?? list[list.length - 1]
    }
    // highest priority wins
    return list.reduce((best, e) => (e.priority > best.priority ? e : best), list[0])
  }

  /** Hook compat: run cb now (no declaration ordering in this minimal host). */
  inject(_key: string, cb: () => void): void { cb() }

  onEntryError(_cb: unknown): () => void { return () => {} }
}
