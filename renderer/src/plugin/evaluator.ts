/**
 * Plugin runtime 底座 — client 半闭包求值器 (Q17A)。
 *
 * 直接沿用官方 evaluateClientHalf 的语义:插件 client 源码作为 async function
 * body 用 new Function 求值,参数即符号面(React/console/styles/host/harness/
 * traps)。教学陷阱封锁浏览器 timer/fetch/require;host 侧 harness 触点抛错;
 * 样式注入走 DynamicCordisStyles(document.style 标签,插件卸载自动清理)。
 *
 * 与官方差异:无 host 半,`host.call` 落到本地 stub(抛"此底座无 host 面")。
 */
import * as React from 'react'

export interface DynamicCordisClosureEnv {
  invoke(method: string, args: unknown): Promise<unknown>
  noteError(message: string): void
}

const TIMER_REDIRECT
  = 'browser timer globals are unavailable in dynamic packages. Declare inject: [\'timer\'] on the returned plugin, '
    + 'and close over that plugin ctx.'

export const DYNAMIC_CLIENT_REDIRECTS: Readonly<Record<string, string>> = {
  setTimeout: TIMER_REDIRECT,
  setInterval: TIMER_REDIRECT,
  clearTimeout: TIMER_REDIRECT,
  clearInterval: TIMER_REDIRECT,
  fetch:
    'network belongs to the HOST half: register a handler there with harness.handle(method, fn) and call it here via host.call(method, args).',
  require:
    'modules cannot be imported here. React arrives as the `React` closure symbol; everything else goes through ctx services or host.call.',
}

function closureTraps(): Record<string, () => never> {
  const traps: Record<string, () => never> = {}
  for (const [name, redirect] of Object.entries(DYNAMIC_CLIENT_REDIRECTS)) {
    traps[name] = (): never => { throw new Error(`${name} is not available in a dynamic client half — ${redirect}`) }
  }
  return traps
}

function harnessTrap(): unknown {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(
        `harness.${String(prop)} belongs to the HOST half (\`code\`): register handlers there with harness.handle(method, fn); `
        + 'the browser half calls them via host.call(method, args).',
      )
    },
  })
}

export class DynamicCordisStyles {
  private readonly tags = new Set<HTMLStyleElement>()
  constructor(private readonly pluginId: string) {}

  insert(css: string): () => void {
    if (typeof css !== 'string') throw new Error('styles.insert(css) needs a CSS string')
    const tag = document.createElement('style')
    tag.dataset.dyn = this.pluginId
    tag.textContent = css
    document.head.append(tag)
    this.tags.add(tag)
    return () => { this.tags.delete(tag); tag.remove() }
  }

  get count(): number { return this.tags.size }

  dispose(): void {
    for (const tag of this.tags) tag.remove()
    this.tags.clear()
  }
}

function errorText(arg: unknown): string {
  if (arg instanceof Error) return arg.message
  if (typeof arg === 'string') return arg
  if (arg === undefined) return 'undefined'
  try { return JSON.stringify(arg) } catch { return '[unserializable console argument]' }
}

function taggedConsole(pluginId: string, noteError: (message: string) => void): Console {
  const tag = `[cordis:${pluginId}]`
  const forward = (level: 'log' | 'info' | 'warn' | 'error' | 'debug') => (...args: unknown[]): void => {
    console[level](tag, ...args)
    if (level !== 'error') return
    noteError(args.map(errorText).join(' ').slice(0, 500))
  }
  return {
    ...console,
    log: forward('log'), info: forward('info'), warn: forward('warn'),
    error: forward('error'), debug: forward('debug'),
  }
}

export interface DynamicCordisEvaluatedPlugin {
  name?: string
  inject?: string[]
  apply: (ctx: unknown, config?: unknown) => unknown
}

export function isDynamicCordisPlugin(value: unknown): value is DynamicCordisEvaluatedPlugin | ((ctx: unknown) => unknown) {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null
    && typeof (value as { apply?: unknown }).apply === 'function'
}

/**
 * Evaluate one client half and return the (un-guarded) plugin.
 */
export async function evaluateClientHalf(
  pluginId: string,
  clientCode: string,
  env: DynamicCordisClosureEnv,
  styles: DynamicCordisStyles,
): Promise<DynamicCordisEvaluatedPlugin | ((ctx: unknown) => unknown)> {
  const traps = closureTraps()
  const parameters = ['React', 'console', 'styles', 'host', 'harness', ...Object.keys(traps), 'process', 'Buffer']
  let closure: (...args: unknown[]) => Promise<unknown>
  try {
    const factory = new Function(...parameters, `return (async () => {\n${clientCode}\n})()`)
    closure = factory as (...args: unknown[]) => Promise<unknown>
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new Error(
      `client half failed to parse in this browser: ${error.message}\n`
      + 'The browser half is plain JavaScript (no JSX, no TypeScript); build elements with React.createElement.',
    )
  }
  const host = {
    call: (method: string, args: unknown = null): Promise<unknown> => env.invoke(method, args),
  }
  const returned = await closure(
    React,
    taggedConsole(pluginId, message => { env.noteError(message) }),
    styles,
    host,
    harnessTrap(),
    ...Object.values(traps),
    undefined, // process
    undefined, // Buffer
  )
  if (!isDynamicCordisPlugin(returned)) {
    if (returned === undefined) {
      throw new Error(
        'client half returned `undefined` — did you forget `return`?\n'
        + '  ✓ return (ctx) => { … }\n'
        + '  ✓ return { name: \'…\', inject: [\'slots\'], apply(ctx) { … } }',
      )
    }
    throw new Error('client half must `return` a plugin: a function, or an object with an `apply(ctx)` method')
  }
  return returned
}
