/**
 * Plugin runtime 底座 — 极简 cordis Context (Q17A)。
 *
 * 官方 client runner 需要「fiber ctx」承载 effect 级联清理、inject 声明与
 * `on/once/provide` 动词。复刻 renderer 不装配 cordis,所以这里给每个动态
 * 插件提供一个 10 行的最小 ctx:fiber.inject 只读、get/provide 服务查找、
 * effect 挂载清理、on 存根。所有副作用在 dispose() 时逆序清理。
 */
export interface MinFiber {
  readonly inject: Readonly<Record<string, boolean>>
}

export interface MinCtx {
  readonly fiber: MinFiber
  get(name: string): unknown
  provide(name: string, value: unknown): void
  effect(fn: () => void, label?: string): () => void
  on(): () => void
  timeout?(fn: () => void, ms: number): unknown
  interval?(fn: () => void, ms: number): unknown
  /** Reverse-order dispose of every registered effect (unload path). */
  _dispose(): void
}

export class MinContext implements MinCtx {
  readonly fiber: MinFiber
  #effects: Array<{ fn: () => void; label?: string }> = []
  #services: Record<string, unknown> = {}

  constructor(declared: readonly string[]) {
    const inject: Record<string, boolean> = {}
    for (const name of declared) inject[name] = true
    this.fiber = { inject }
  }

  get(name: string): unknown { return this.#services[name] }

  provide(name: string, value: unknown): void { this.#services[name] = value }

  effect(fn: () => void, label?: string): () => void {
    const rec = { fn, label }
    this.#effects.push(rec)
    return () => {
      const at = this.#effects.indexOf(rec)
      if (at !== -1) this.#effects.splice(at, 1)
      fn()
    }
  }

  on(): () => void { return () => {} }

  timeout(fn: () => void, ms: number): unknown {
    const handle = setTimeout(fn, ms)
    this.effect(() => clearTimeout(handle), 'min-ctx: timeout')
    return handle
  }

  interval(fn: () => void, ms: number): unknown {
    const handle = setInterval(fn, ms)
    this.effect(() => clearInterval(handle), 'min-ctx: interval')
    return handle
  }

  _dispose(): void {
    for (const rec of [...this.#effects].reverse()) {
      try { rec.fn() } catch { /* dispose must not throw */ }
    }
    this.#effects = []
  }
}

/** Standard ✗-shaped duck-check: is this a cordis Context (denied service return)? */
export function isContextLike(value: unknown): boolean {
  return typeof value === 'object' && value !== null
    && typeof (value as { fiber?: unknown }).fiber === 'object'
    && typeof (value as { get?: unknown }).get === 'function'
}
