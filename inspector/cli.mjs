#!/usr/bin/env node
// ============================================================
// inspector/cli.mjs — 组件召唤器命令行(AI/终端入口)。
// 前提:已用 `npm run start:inspector`(或 :fixture)启动 Electron 官方 UI。
//
// 用法:
//   node inspector/cli.mjs status [--wait] [--timeout 60]   状态(--wait 阻塞至就绪)
//   node inspector/cli.mjs reload                       重载配方/面板(改 recipes.js 后不必重启)
//   node inspector/cli.mjs kill                         清场:杀掉所有 electron --inspector 进程树
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
// 环境变量:ZION_INSPECTOR_URL(默认读 inspector/.port —— 主进程启动时写入,
// 端口被占退避时 cli 也能找到实际端口)
// ============================================================
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function defaultBase() {
  try {
    const port = fs.readFileSync(path.join(ROOT, 'inspector', '.port'), 'utf8').trim()
    if (/^\d+$/.test(port)) return `http://127.0.0.1:${port}`
  } catch { /* 无端口文件 */ }
  return 'http://127.0.0.1:5198'
}
const BASE = process.env.ZION_INSPECTOR_URL ?? defaultBase()

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

/** 截图元信息:尺寸 + 亮度均值(判断是否有效帧)+ 是否重拍。 */
function shotMeta(shot) {
  const size = shot.size ? `${shot.size.width}x${shot.size.height}` : ''
  const mean = shot.mean !== undefined && shot.mean !== null ? `, 亮度 ${shot.mean}` : ''
  const retried = shot.retried ? ', retried' : ''
  return size ? ` (${size}${mean}${retried})` : ''
}

function printEntry(e) {
  const off = e.official ? ` 官方→ ${e.official.module}#${e.official.component ?? '(真实配方)'}` : ''
  console.log(`  ${e.id}  ${e.name}  [${e.tag}]${off}`)
  if (e.mount) console.log(`      挂载: ${e.mount}`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'status': {
      const wait = has(rest, '--wait')
      const timeoutMs = Number(flag(rest, '--timeout') || 60) * 1000
      if (wait) {
        const start = Date.now()
        for (;;) {
          try {
            const s = await api('GET', '/api/inspector/status')
            console.log(`就绪(${Math.round((Date.now() - start) / 1000)}s):`)
            console.log(JSON.stringify(s, null, 2))
            break
          } catch {
            if (Date.now() - start > timeoutMs) {
              console.error(`✗ ${timeoutMs / 1000}s 内控制口未就绪(仍按 ${BASE} 探测)`)
              process.exitCode = 1
              break
            }
            await new Promise((r) => setTimeout(r, 2000))
          }
        }
        break
      }
      const s = await api('GET', '/api/inspector/status')
      console.log(JSON.stringify(s, null, 2))
      break
    }
    case 'reload': {
      const r = await api('POST', '/api/inspector/reload')
      if (!r.ok) throw new Error(r.error)
      console.log(`✓ ${r.note || '面板/配方已重载'}(改 recipes.js / page-panel.js / manifest.json 后执行,不必重启 app)`)
      break
    }
    case 'kill': {
      // 清场:杀掉所有命令行含 --inspector 的 electron 进程树(Windows)。
      if (process.platform !== 'win32') { console.log('kill 子命令仅支持 Windows;请手动结束 electron 进程'); break }
      const ps = `Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -match '--inspector' } | ForEach-Object { $_.ProcessId }`
      let pids = ''
      try {
        pids = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim()
      } catch { /* 无匹配 */ }
      const list = pids.split(/\s+/).filter(Boolean)
      if (list.length === 0) { console.log('没有运行中的 electron --inspector 实例(或已全部退出)'); break }
      for (const pid of list) {
        try { execFileSync('taskkill', ['/F', '/T', '/PID', pid], { stdio: 'ignore' }) } catch { /* 可能已退出 */ }
      }
      console.log(`已清场 ${list.length} 个 electron --inspector 进程(PID: ${list.join(', ')})`)
      try { fs.rmSync(path.join(ROOT, 'inspector', '.port'), { force: true }) } catch { /* ignore */ }
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
        // 传回 summon 算好的 rect(多选择器并集时 elementRect 只取首个匹配,不可靠)
        const shot = await api('POST', '/api/inspector/shot', { name, selector: r.selector || null, rect: r.rect || null })
        if (!shot.ok) throw new Error(shot.error)
        console.log(`  截图: ${shot.path}${shotMeta(shot)}`)
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
        const shot = await api('POST', '/api/inspector/shot', { name, selector: r.selector || null, rect: r.rect || null })
        if (!shot.ok) throw new Error(shot.error)
        console.log(`  截图: ${shot.path}${shotMeta(shot)}`)
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
        // 传回 summon 算好的 rect(多选择器并集时 elementRect 只取首个匹配,不可靠)
        const shot = await api('POST', '/api/inspector/shot', { name, selector: r.selector || null, rect: r.rect || null })
        if (!shot.ok) throw new Error(shot.error)
        console.log(`  截图: ${shot.path}${shotMeta(shot)}`)
      }
      break
    }
    case 'shot': {
      const name = flag(rest, '--name') || 'shot'
      const selector = flag(rest, '--selector')
      const r = await api('POST', '/api/inspector/shot', { name, selector: selector || null })
      if (!r.ok) throw new Error(r.error)
      console.log(`截图: ${r.path}${shotMeta(r)}${r.rect ? ` rect=${JSON.stringify(r.rect)}` : ''}`)
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
      console.log(`用法: node inspector/cli.mjs <status|reload|kill|list|summon|raw|recipe|shot|eval|close> …`)
      process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`)
  console.error('  请确认已运行 npm run start:inspector(或 :fixture),且控制口 5198 可达。')
  process.exitCode = 1
})
