#!/usr/bin/env node
// ============================================================
// inspector/gen-manifest.mjs — 从 docs/ui-component-inventory.md 生成
// inspector/manifest.json(组件召唤器的清单数据源)。
//
// 用法:  node inspector/gen-manifest.mjs
// 产物:  inspector/manifest.json(提交入库;文档变更后重新生成)
//
// 每个条目:
//   {
//     id, name, part (A/B/C), desc, mount,
//     entries: [交互入口…], data,
//     tag: 'official' | 'zion-add' | 'slot' | 'mixed',
//     official: { module, component, modes } | null   // 官方组件映射(curated)
//   }
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DOC = path.join(ROOT, 'docs', 'ui-component-inventory.md')
const OUT = path.join(ROOT, 'inspector', 'manifest.json')

// --- curated 官方组件映射(v1:已核验可 import 的官方 client 模块导出) ----
// modes: 'overlay' = 可用 window.__DSH_MODULES__ 动态 import 后舞台挂载;
//        'real'    = 有「真实状态配方」(recipes.js),驱动官方 UI 真实出现。
const OFFICIAL = {
  GoalBar: {
    module: '@deepseek-ai/dsh-client-ui-goal',
    component: 'GoalBar',
    modes: ['overlay', 'real'],
  },
  TodoDockSeat: {
    module: '@deepseek-ai/dsh-client-ui-conversation',
    component: null, // TodoPanel 未从模块导出 → 只能走真实配方(?fixture 会话自带 todo 投影)
    modes: ['real'],
    aliases: ['TodoDock', 'TodoPanel'],
  },
  JobListActionSeat: {
    module: '@deepseek-ai/dsh-client-ui-jobs',
    component: null, // JobListAction 未从模块导出(仅 apply/inject)→ 需真实后台任务才可见
    modes: [],
  },
  ContextMeterSeat: {
    module: '@deepseek-ai/dsh-client-ui-conversation',
    component: null,
    modes: [],
  },
}

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'

function parse() {
  const lines = fs.readFileSync(DOC, 'utf8').split(/\r?\n/)
  const entries = []
  let part = null
  let current = null // {raw: [...]}

  const flush = () => {
    if (current === null) return
    const raw = current.raw
    const head = raw[0]
    const m = /^####\s+([A-C]\d+)\.\s+(.+?)\s*—\s*(.*)$/.exec(head)
    const id = m ? m[1] : 'x'
    const name = (m ? m[2] : head.replace(/^####\s+/, '')).trim()
    const desc = m ? m[3].trim() : ''
    const field = {}
    let key = null
    for (const line of raw.slice(1)) {
      const f = /^-\s*\*\*([^*]+)\*\*:/.exec(line)
      if (f) { key = f[1].trim(); field[key] = [] ; continue }
      const isBullet = /^\s*[-•]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)
      if (key && isBullet) field[key].push(line.trim())
      else if (key && line.trim() !== '' && field[key].length === 0) field[key].push(line.trim())
    }
    const join = (arr) => (arr && arr.length ? arr.join('\n') : '')
    const entriesText = join(field['交互入口'])
    entries.push({
      id: `${id}-${slug(name)}`,
      name,
      part,
      desc,
      mount: join(field['挂载']),
      entries: field['交互入口'] ?? [],
      data: join(field['数据']),
      tag: tagOf(entriesText),
      official: pickOfficial(name, entriesText, false),
    })
    current = null
  }

  for (const line of lines) {
    const pm = /^###\s+Part\s+([A-C])/.exec(line)
    if (pm) { flush(); part = pm[1]; continue }
    const hm = /^####\s+/.test(line)
    if (hm) { flush(); current = { raw: [line] }; continue }
    if (current) current.raw.push(line)
  }
  flush()

  // Part B / C 表格行(座位/适配层 + 插件槽)——只在 "### Part B/C —" 小节内收集
  let inTable = false
  let tablePart = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const pm = /^###\s+Part\s+([A-C])/.exec(line)
    if (pm) { tablePart = pm[1]; inTable = false; continue }
    if (/^##\s+/.test(line)) { inTable = false; continue }
    if (tablePart !== 'B' && tablePart !== 'C') { inTable = false; continue }
    if (/^\|/.test(line)) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      if (!inTable && cells.some((c) => /座位|文件|导出|说明/.test(c))) { inTable = true; continue }
      if (inTable && /^\|[\s\-|]+\|$/.test(line)) continue
      if (inTable && cells.length >= 2 && cells[0] !== '') {
        const name = cells[0]
        const rowText = cells.join(' | ')
        entries.push({
          id: `${tablePart.toLowerCase()}-${slug(name)}`,
          name,
          part: tablePart,
          desc: '表格行(座位/适配层)',
          mount: '',
          entries: [],
          data: rowText,
          tag: 'mixed',
          official: pickOfficial(name, rowText),
        })
      }
      continue
    }
    inTable = false
  }
  return entries
}

function tagOf(text) {
  if (text.includes('[official]') && !text.includes('[zion-add]') && !text.includes('[slot]')) return 'official'
  if (text.includes('[zion-add]') && !text.includes('[official]') && !text.includes('[slot]')) return 'zion-add'
  if (text.includes('[slot]') && !text.includes('[official]') && !text.includes('[zion-add]')) return 'slot'
  return 'mixed'
}

/** 按名称/文本匹配 curated 官方映射(header 名优先;文本匹配只用于表格行)。 */
function pickOfficial(name, text, allowText = true) {
  for (const key of Object.keys(OFFICIAL)) {
    const meta = OFFICIAL[key]
    const names = [key, ...(meta.aliases ?? [])]
    if (names.some((n) => name === n || (name.includes(n) && n.length > 4))) {
      return { ...meta }
    }
  }
  if (allowText) {
    for (const key of Object.keys(OFFICIAL)) {
      const meta = OFFICIAL[key]
      const names = [key, ...(meta.aliases ?? [])]
      if (names.some((n) => text.includes(n))) return { ...meta }
    }
  }
  return null
}

const entries = parse()
const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'docs/ui-component-inventory.md',
  entries,
}
fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n')
console.log(`[inspector] manifest.json 生成完成: ${entries.length} 个条目 (${OUT})`)
const withOfficial = entries.filter((e) => e.official !== null)
console.log(`[inspector] 已映射官方组件: ${withOfficial.length} 个`)
for (const e of withOfficial) console.log(`  - ${e.id}: ${e.name} → ${e.official.module}#${e.official.component ?? '(真实配方)'}`)
