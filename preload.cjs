// deepseek-zion — PROTOTYPE preload (CommonJS — sandboxed renderers require CJS)
// Normal mode exposes only read-only env facts. The harness UI runs with full
// context-isolation / sandbox; inspector mode additionally installs the
// document-start capture hook below.
const { contextBridge } = require('electron')

// Inspector-only document-start hook.  DSH 0.1.1 no longer publishes its real
// ClientModuleSystem on window: the public __ModuleLoader__ is only a facade
// with load/create.  The first official inline script assigns that facade, so
// install a one-shot setter in the main world before page scripts execute and
// observe create()'s return value without copying it across isolated worlds.
if (process.isMainFrame && process.argv.includes('--zion-inspector-capture-modules')) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        const loaderKey = '__ModuleLoader__'
        const capturedKey = '__ZION_INSPECTOR_MODULES__'
        const wrapped = new WeakSet()

        const capture = (loader) => {
          if (!loader || typeof loader.create !== 'function' || wrapped.has(loader)) return
          wrapped.add(loader)
          const originalCreate = loader.create
          loader.create = function (...args) {
            const modules = Reflect.apply(originalCreate, this, args)
            Object.defineProperty(globalThis, capturedKey, {
              configurable: true,
              enumerable: false,
              writable: false,
              value: modules,
            })
            return modules
          }
        }

        const current = globalThis[loaderKey]
        if (current !== undefined) {
          capture(current)
          return
        }

        Object.defineProperty(globalThis, loaderKey, {
          configurable: true,
          get() { return undefined },
          set(loader) {
            // Restore the same ordinary property shape produced by assignment;
            // only create() remains wrapped, and its behavior is preserved.
            delete globalThis[loaderKey]
            Object.defineProperty(globalThis, loaderKey, {
              configurable: true,
              enumerable: true,
              writable: true,
              value: loader,
            })
            capture(loader)
          },
        })
      },
    })
  } catch (error) {
    console.error('[zion-inspector] 无法安装模块系统捕获钩子:', error?.message || error)
  }
}

contextBridge.exposeInMainWorld(
  'zion',
  {
    platform: process.platform,
    version: '0.1.0-proto',
    port: Number(process.env.ZION_PORT ?? 3080),
  },
)
