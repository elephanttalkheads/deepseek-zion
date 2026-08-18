/**
 * Plugin runtime 底座 — 动态插件 ctx guard (Q17A)。
 *
 * 复用官方 dynamicCordisContext 的白名单语义:CTX_VERBS 惰性转发 + 声明式
 * 服务直读 + ctx.get 可选查找 + slots 坐席(注册记账/优先级)。无 theme 坐席
 * (复刻无主题层)。Context 返回拒绝用本底座的 isContextLike。
 */
import { isContextLike, type MinCtx } from './min-ctx.ts'
import { SlotRegistry, type RegisterOptions } from './slot-registry.ts'

const CTX_VERBS = ['effect', 'on', 'once', 'provide', 'timeout', 'interval', 'setTimeout', 'setInterval', 'throttle', 'debounce'] as const

export interface DynamicCordisSlotLedgerRow {
  slot: string
  priority: number | undefined
}

export interface DynamicCordisGuardEnv {
  pkg: { pluginId: string; packageId: string; pluginRunId: string; name?: string }
  ledger: DynamicCordisSlotLedgerRow[]
  claim(component: unknown): void
  allocatePriority(): number
  reportFailure(error: Error): void
  /** Track one slot-registration disposer so runtime.unload clears entries. */
  trackSlotDispose(fn: () => void): void
}

function rejectGuard(env: DynamicCordisGuardEnv, message: string): never {
  const error = new Error(message)
  env.reportFailure(error)
  throw error
}

function denyContext(value: unknown, _service: string, env: DynamicCordisGuardEnv): unknown {
  if (isContextLike(value)) {
    return rejectGuard(env,
      'service returned a cordis Context, which the dynamic facade does not expose. '
      + 'Operate through your own plugin ctx and the services you declared — never another context.',
    )
  }
  return value
}

/** Generic forwarder: service methods keep `this = service` so prototype `this.ctx` stays the caller's. */
function guardedService(service: object, name: string, env: DynamicCordisGuardEnv): unknown {
  return new Proxy(service, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown
      if (typeof value !== 'function') return denyContext(value, name, env)
      // Guard against registration methods being detached: slot.register needs this=slots;
      // wrap but keep receiver.
      return (...args: unknown[]): unknown => {
        const result = Reflect.apply(value, target, args) as unknown
        if (result instanceof Promise) return result.then(resolved => denyContext(resolved, name, env))
        return denyContext(result, name, env)
      }
    },
  })
}

/** The slots seat: ledger + shadowing priority around the registry's own register. */
function guardedSlots(slots: SlotRegistry, env: DynamicCordisGuardEnv): unknown {
  return new Proxy(slots, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown
      if (prop !== 'register') {
        if (typeof value !== 'function') return denyContext(value, 'slots', env)
        return (...args: unknown[]): unknown => denyContext(Reflect.apply(value, target, args), 'slots', env)
      }
      return (rawOptions: unknown, component: unknown): unknown => {
        if (typeof rawOptions !== 'object' || rawOptions === null) {
          return rejectGuard(env, 'slots.register(options, component) needs an options object with a `name`')
        }
        const options = { ...rawOptions as RegisterOptions }
        const slot = options.name
        if (typeof slot !== 'string' || slot.length === 0) {
          return rejectGuard(env, 'slots.register options need a string `name` (the target slot key)')
        }
        if (slot === 'tool.view.cordis') {
          if (options.key !== 'self') {
            return rejectGuard(env, 'tool.view.cordis only accepts key "self"; the runtime binds it to this Package')
          }
          options.key = `${env.pkg.pluginId}.${env.pkg.packageId}`
        }
        // Shadowing kinds get a page-local rank (later sorts first); chain keeps election.
        const spec = slots.spec(slot)
        let priority = options.priority
        if (spec === undefined || spec.kind !== 'chain') {
          priority = env.allocatePriority()
          options.priority = priority
        }
        const register = Reflect.get(target, 'register', target) as unknown as (opts: RegisterOptions, comp: unknown) => () => void
        let dispose: (() => void) | undefined
        try {
          dispose = register.call(target, options, component)
        } catch (error) {
          return rejectGuard(env, `slot "${slot}" registration rejected: ${error instanceof Error ? error.message : String(error)}`)
        }
        env.ledger.push({ slot, priority })
        env.claim(component)
        env.trackSlotDispose(dispose)
        return dispose
      }
    },
  })
}

/**
 * 白名单 facade,给一个动态插件的 apply(ctx)。
 */
export function dynamicCordisContext(ctx: MinCtx, env: DynamicCordisGuardEnv): MinCtx {
  const declared = new Set(Object.keys(ctx.fiber.inject))
  const denyRead = (prop: string): never => {
    if (ctx.get(prop) !== undefined) {
      return rejectGuard(env,
        `service "${prop}" is not declared by your plugin. Declare it on the plugin you return: `
        + `{ inject: ['${prop}', …], apply(ctx) { … } }`,
      )
    }
    return rejectGuard(env,
      `dynamic ctx does not expose "${prop}". Available: ctx.on / ctx.provide / slots (declared in inject), and any service you declared. `
      + 'Framework internals are withheld by design.',
    )
  }
  const readService = (name: string, requireDeclaration: boolean): unknown => {
    if (requireDeclaration && !declared.has(name)) return denyRead(name)
    const service = denyContext(ctx.get(name), name, env)
    if (service === null || (typeof service !== 'object' && typeof service !== 'function')) return service
    if (name === 'slots') return guardedSlots(service as SlotRegistry, env)
    return guardedService(service, name, env)
  }
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'get') return (name: string): unknown => readService(name, false)
      if (typeof prop !== 'string') return undefined
      if ((CTX_VERBS as readonly string[]).includes(prop)) {
        return (...args: unknown[]): unknown => {
          const method = (ctx as unknown as Record<string, unknown>)[prop]
          if (typeof method !== 'function') return rejectGuard(env, `ctx.${prop} is unavailable on this minimal context`)
          return Reflect.apply(method as (...a: unknown[]) => unknown, ctx, args)
        }
      }
      return readService(prop, true)
    },
    set(_target, prop) {
      return rejectGuard(env, `dynamic ctx is read-only; cannot assign "${String(prop)}"`)
    },
    has(_target, prop) {
      return prop === 'get'
        || (typeof prop === 'string'
          && ((CTX_VERBS as readonly string[]).includes(prop) || declared.has(prop)))
    },
  }) as unknown as MinCtx
}
