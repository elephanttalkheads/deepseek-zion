#!/usr/bin/env node
// ============================================================
// inspector/cli.mjs — 组件召唤器命令行(AI/终端入口)。
// 前提:已用 `npm run start:inspector`(或 :fixture)启动 Electron 官方 UI。
//
// 用法:
//   node inspector/cli.mjs status                      状态
//   node inspector/cli.mjs list [--json]               清单(ui-component-inventory.md)
//   node inspector/cli.mjs summon <id> [--shot] [--name N] [--mode overlay|real]
//       <id> 可匹配配方键(goal-bar / goal-bar-paused / goal-bar-blocked /
//             goal-bar-real / todo-dock / job-list)或清单条目(A6-goalbar 等)
//   node inspector/cli.mjs raw <module> <component> [--props '{"…":…}'] [--shot] [--name N]
//   node inspector/cli.mjs recipe <id> [--shot] [--name N]
//   node inspector/cli.mjs shot [--selector '.sel'] [--name N]   截图(默认全窗)
//   node inspector/cli.mjs eval <js 表达式>           页内执行(返回 JSON 安全值)
//   node inspector/cli.mjs close                      关闭舞台
//
// 环境变量:ZION_INSPECTOR_URL(默认 http://127.0.0.1:5198)
// ============================================================
const BASE = process.env.ZION_INSPECTOR_URL ?? 'http://127.0.0.1:5198'

async function api(method, route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

const flag = (args, name) => {
  const i = args.indexOf(name)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined
}
const has = (args, name) => args.includes(name)

function printEntry(e) {
  const off = e.official ? ` 官方→ ${e.official.module}#${e.official.component ?? '(真实配方)'}` : ''
  console.log(`  ${e.id}  ${e.name}  [${e.tag}]${off}`)
  if (e.mount) console.log(`      挂载: ${e.mount}`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'status': {
      const s = await api('GET', '/api/inspector/status')
      console.log(JSON.stringify(s, null, 2))
      break
    }
    case 'list': {
      const r = await api('POST', '/api/inspector/list')
      if (!r.ok) throw new Error(r.error)
      if (has(rest, '--json')) { console.log(JSON.stringify(r.entries, null, 2)); break }
      console.log(`组件清单(${r.entries.length} 条,来自 docs/ui-component-inventory.md):`)
      const q = flag(rest, '--filter')
      for (const e of r.entries) {
        if (q && !e.name.toLowerCase().includes(q.toLowerCase()) && !e.id.toLowerCase().includes(q.toLowerCase())) continue
        printEntry(e)
      }
      break
    }
    case 'summon': {
      const id = rest[0]
      if (!id) throw new Error('summon 需要组件 id/配方键')
      const opts = { mode: flag(rest, '--mode') }
      const r = await api('POST', '/api/inspector/summon', { id, opts })
      if (!r.ok) throw new Error(r.error)
      console.log(`✓ ${r.mode}${r.recipeId ? ` (${r.recipeId})` : ''}: ${r.note || ''}`)
      if (r.rect) console.log(`  rect: ${JSON.stringify(r.rect)}  selector: ${r.selector}`)
      if (has(rest, '--shot')) {
        const name = flag(rest, '--name') || r.recipeId || id
        const shot = await api('POST', '/api/inspector/shot', { name, selector: r.selector || null })
        if (!shot.ok) throw new Error(shot.error)
        console.log(`  截图: ${shot.path}`)
      }
      break
    }
    case 'raw': {
      const module = rest[0]
      const component = rest[1]
      if (!module || !component) throw new Error('raw 需要 <module> <component>')
      const propsRaw = flag(rest, '--props')
      let props = {}
      if (propsRaw) { try { props = JSON.parse(propsRaw) } catch { throw new Error('--props 不是合法 JSON') } }
      const r = await api('POST', '/api/inspector/raw', { module, component, props })
      if (!r.ok) throw new Error(r.error)
      console.log(`✓ 舞台挂载 ${module}#${component}: ${r.note || ''}`)
      if (r.rect) console.log(`  rect: ${JSON.stringify(r.rect)}`)
      if (has(rest, '--shot')) {
        const name = flag(rest, '--name') || `${component}-raw`
        const shot = await api('POST', '/api/inspector/shot', { name, selector: r.selector || null })
        if (!shot.ok) throw new Error(shot.error)
        console.log(`  截图: ${shot.path}`)
      }
      break
    }
    case 'recipe': {
      const id = rest[0]
      if (!id) throw new Error('recipe 需要配方键')
      const r = await api('POST', '/api/inspector/recipe', { id })
      if (!r.ok) throw new Error(r.error)
      console.log(`✓ ${r.mode} (${r.recipeId || id}): ${r.note || ''}`)
      if (r.rect) console.log(`  rect: ${JSON.stringify(r.rect)}  selector: ${r.selector}`)
      if (has(rest, '--shot')) {
        const name = flag(rest, '--name') || r.recipeId || id
        const shot = await api('POST', '/api/inspector/shot', { name, selector: r.selector || null })
        if (!shot.ok) throw new Error(shot.error)
        console.log(`  截图: ${shot.path}`)
      }
      break
    }
    case 'shot': {
      const name = flag(rest, '--name') || 'shot'
      const selector = flag(rest, '--selector')
      const r = await api('POST', '/api/inspector/shot', { name, selector: selector || null })
      if (!r.ok) throw new Error(r.error)
      console.log(`截图: ${r.path}${r.rect ? ` rect=${JSON.stringify(r.rect)}` : ''}`)
      break
    }
    case 'eval': {
      const code = rest.join(' ')
      if (!code) throw new Error('eval 需要 JS 表达式')
      const r = await api('POST', '/api/inspector/eval', { code })
      if (!r.ok) throw new Error(r.error)
      console.log(JSON.stringify(r.value, null, 2))
      break
    }
    case 'close': {
      const r = await api('POST', '/api/inspector/close')
      if (!r.ok) throw new Error(r.error)
      console.log('舞台已关闭')
      break
    }
    default:
      console.log(`用法: node inspector/cli.mjs <status|list|summon|raw|recipe|shot|eval|close> …`)
      process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  console.error('  请确认已运行 npm run start:inspector(或 :fixture),且控制口 5198 可达。')
  process.exitCode = 1
})
