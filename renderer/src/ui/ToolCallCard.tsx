/**
 * M3 — ToolCallCard (Q19A self-authored presentational layer).
 *
 * DESIGN.md §2.8 工具纯行 + 角括号聚光(D2+V2;数值照 composite-tui .tl/.cb):
 * 外壳 = .tool-line.{run|ok|err}(button + aria-expanded 语义与键盘可达保留)。
 * 闭环/错误 = 纯行(状态图标 + 工具名 · 参数摘要,无框无底;错误 = 红字行不画红框);
 * 运行中 = 四角角括号 ⌜⌝⌞⌟(70% 档,绝对定位不连线)+ ┐标题┌ notch。
 * 状态图标复用 ./status-icon.tsx 的 SET D 原子(§2.5:run 扰码 / done 锁定勾 /
 * err 故障切片);展开内容 ⎿ 缩进续行,ToolBody 全部分支
 * (terminal/diff/JSON/content/args/error)不变;
 * diff 卡 = MatrixDiffCard 烧录显影(块 9,数值照 demo)。
 */
import { useState } from 'react'
import type { RunningToolCall, ToolCallBlock, ToolResultNode } from '../../vendor/client-runtime/client/sessions/conversation.ts'
import { StatusIcon, type StatusIconKind } from './status-icon.tsx'

/** Settled discrimination: only ToolResultNode carries the literal kind marker. */
function isSettled(block: ToolCallBlock): block is ToolResultNode {
  return (block as ToolResultNode).kind === 'tool-result'
}

/** The root's wire name (settled uses the backfilled call head). */
function toolName(block: ToolCallBlock): string {
  return isSettled(block)
    ? (block.call?.name ?? 'tool')
    : (block as RunningToolCall).name ?? 'tool'
}

const TOOL_TITLES: Record<string, string> = {
  bash: 'Bash', read: 'Read', edit: 'Edit', write: 'Write',
  grep: 'Grep', glob: 'Glob', web_search: 'Search', web_fetch: 'Fetch',
  todo_write: 'Todo', ask_user_question: 'Ask', pwsh: 'Pwsh',
  skill: 'Skill', run_code: 'Code', code: 'Code',
  cordis_run: 'Run Cordis Plugin', cordis_define: 'Define Plugin',
  cordis_stop: 'Stop Plugin', cordis_undefine: 'Undefine Plugin', cordis_inspect: 'Inspect',
}

/** Classify unknown wire names into official-ish variants (GenericToolCard posture). */
function classifyTool(name: string): string {
  if (TOOL_TITLES[name] !== undefined) return name
  if (/echo|bash|pwsh|sh$|shell|^cmd/.test(name)) return 'bash'
  if (/^read$|read|view|cat|show|^less$/.test(name)) return 'read'
  if (/^edit$|edit|apply|patch|^sed/.test(name)) return 'edit'
  if (/^write$|write|create|mkdir|append|echo/.test(name)) return 'write'
  if (/search|grep|find|rg$|glob|ag$/.test(name)) return 'search'
  if (/run_code|python|node|execute|eval/.test(name)) return 'code'
  return 'others'
}

/** Settled 真实耗时秒(wire 字段 time - callTime;无配对数据返回 null → 数码管显 —)。 */
function settledDurationSec(block: ToolResultNode): number | null {
  if (block.callTime === null) return null
  return (block.time - block.callTime) / 1000
}

/** File-ish tools summarize the path; others summarize args. */
function deriveSummary(block: ToolCallBlock): string {
  const settled = isSettled(block)
  const name = toolName(block)
  const argsRaw = settled ? (block.call?.argsRaw ?? '') : (block as RunningToolCall).argsRaw ?? ''
  let json: unknown = null
  try { json = argsRaw === '' ? null : JSON.parse(argsRaw) } catch { json = null }
  const variant = classifyTool(name)
  if (json !== null && typeof json === 'object') {
    const o = json as Record<string, unknown>
    if (variant === 'bash' && typeof o.command === 'string') return oneLine(o.command)
    if (variant === 'search' && typeof o.pattern === 'string') return String(o.pattern)
    if (variant === 'edit' && typeof o.old_string === 'string' && typeof o.new_string === 'string') {
      return `${String(o.path ?? o.file_name ?? o.file_path ?? '')} · replace`
    }
    if (variant === 'read' || variant === 'edit' || variant === 'write') {
      const p = o.path ?? o.file_path ?? o.file_name
      if (typeof p === 'string') return p
    }
  }
  return oneLine(argsRaw) || '…'
}

function oneLine(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > 180 ? one.slice(0, 180) + '…' : one
}

// ---- Matrix diff 卡(M1:port of pi-martix DiffCard + DSH wire adapter) ----

/** diff 卡行(与 pi-martix DiffRow 同构) */
interface DiffRow { t: '+' | '-' | ' '; n: string | null; c: string }

/** 结构化 wire diff:hunks 的单个块(DiffHunk shape) */
interface DiffHunk { path?: string; oldText?: string | null; newText?: string }

/**
 * 把 wire 的 hunk(path/oldText/newText)转成 pi-martix 行模型。
 * 逐 hunk 产出;每个 hunk 内部用公共前缀/后缀朴素 diff(整段删+增)。
 */
function rowsFromTexts(oldT: string | undefined, newT: string | undefined): DiffRow[] {
  const oldLines = oldT === undefined ? [] : oldT.split('\n')
  const newLines = newT === undefined ? [] : newT.split('\n')
  let pre = 0
  while (pre < oldLines.length && pre < newLines.length && oldLines[pre] === newLines[pre]) pre++
  let suf = 0
  while (
    suf < oldLines.length - pre &&
    suf < newLines.length - pre &&
    oldLines[oldLines.length - 1 - suf] === newLines[newLines.length - 1 - suf]
  ) {
    suf++
  }
  const rows: DiffRow[] = []
  for (let i = 0; i < pre; i++) rows.push({ t: ' ', n: String(i + 1), c: oldLines[i] })
  for (let i = pre; i < oldLines.length - suf; i++) rows.push({ t: '-', n: String(i + 1), c: oldLines[i] })
  for (let i = pre; i < newLines.length - suf; i++) rows.push({ t: '+', n: String(i + 1), c: newLines[i] })
  for (let i = newLines.length - suf; i < newLines.length; i++) {
    rows.push({ t: ' ', n: String(i + 1), c: newLines[i] })
  }
  return rows
}

/** 从 wire view 里规范化 diffs(不 throw;非法即 null → 走通用路径) */
function narrowDiffs(view: unknown): DiffHunk[] | null {
  if (view === null || typeof view !== 'object') return null
  const diffs = (view as { diffs?: unknown }).diffs
  if (!Array.isArray(diffs)) return null
  const out: DiffHunk[] = []
  for (const h of diffs) {
    if (typeof h !== 'object' || h === null) return null
    const { path, oldText, newText } = h as Record<string, unknown>
    if (typeof path !== 'string') return null
    if (oldText !== null && typeof oldText !== 'string') return null
    if (typeof newText !== 'string') return null
    out.push({ path, oldText, newText })
  }
  return out.length === 0 ? null : out
}

/** 块 9 烧录显影上限:行 delay 与 ring delay 的行数都按 BURN_CAP 封顶(demo 逐字)。 */
const BURN_CAP = 30

/** Matrix diff 卡:校验环 + 文件头(+/- 计数/MODIFIED)+ 烧录显影行(M1 port from pi-martix;
 *  块 9 数值审计:行 delay=min(i,30)*0.09s,ring delay=min(rows,30)*0.09+0.9,pathLength=400) */
function MatrixDiffCard({ file, rows }: { file: string; rows: DiffRow[] }): JSX.Element {
  let plus = 0
  let minus = 0
  for (const r of rows) {
    if (r.t === '+') plus++
    else if (r.t === '-') minus++
  }
  const dFile = file.startsWith('✎ ') ? file : `✎ ${file}`
  const ringDelay = Math.min(rows.length, BURN_CAP) * 0.09 + 0.9
  return (
    <div className="matrix-diff">
      <svg className="matrix-diff-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="1" y="1" width="98" height="98" pathLength={400} style={{ animationDelay: `${ringDelay}s` }} />
      </svg>
      <div className="matrix-diff-head">
        <span className="matrix-diff-file">{dFile}</span>
        <span className="matrix-diff-plus">+{plus}</span>
        <span className="matrix-diff-minus">−{minus}</span>
        <span className="matrix-diff-mod">MODIFIED</span>
      </div>
      <div className="matrix-diff-body">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`matrix-diff-row ${r.t === '+' ? 'add' : r.t === '-' ? 'del' : 'ctx'}`}
            style={{ animationDelay: `${Math.min(i, BURN_CAP) * 0.09}s` }}
          >
            <span className="matrix-diff-ln">{r.n ?? ''}</span>
            <span className="matrix-diff-sign">{r.t === '+' ? '+' : r.t === '-' ? '−' : '·'}</span>
            <span className="matrix-diff-code">{r.c || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Render the body inside the expanded row, keyed on the result card. */
function ToolBody({ block }: { block: ToolCallBlock }): JSX.Element {
  const settled = isSettled(block)
  const view = settled ? block.resultView : (block as RunningToolCall).callView
  const cardName = view?.card !== undefined ? String(view.card) : null

  // Terminal-ish card
  if (cardName === 'terminal') {
    return <pre className="tool-body tool-body--terminal">{renderText(view)}</pre>
  }
  // Matrix diff 卡(M1):wire card='diff' + 合法 diffs → 烧录显影渲染
  if (cardName === 'diff') {
    const hunks = narrowDiffs(view)
    if (hunks !== null) {
      const rows: DiffRow[] = []
      const firstPath = hunks.find(h => h.path !== '')?.path ?? hunks[0]?.path ?? ''
      for (const h of hunks) {
        rows.push(...rowsFromTexts(h.oldText ?? undefined, h.newText))
      }
      return <MatrixDiffCard file={firstPath} rows={rows} />
    }
    // diffs 缺失/非法 → 回退通用路径(兼容官方语义:非法 payload 走 generic)
  }
  // Diff / read / search / web fall back to structured text dump
  if (cardName !== null) {
    return <pre className="tool-body tool-body--card">{renderText(view)}</pre>
  }
  // Settled: content blocks
  if (settled) {
    const content = block.content
    if (Array.isArray(content) && content.length > 0) {
      const parts = content.map(c => (c.type === 'text' ? c.text ?? '' : `[${c.type ?? 'block'}]`)).join('\n')
      return <pre className={`tool-body tool-body--out${block.isError ? ' tool-body--error' : ''}`}>{parts}</pre>
    }
  }
  // Call args
  const args = settled ? (block.call?.argsRaw ?? '') : (block as RunningToolCall).argsRaw ?? ''
  const err = settled ? (block as { error?: unknown }).error : null
  if (err !== null && err !== undefined) return <pre className="tool-body tool-body--error">{String(err)}</pre>
  if (args !== '') return <pre className="tool-body tool-body--args">{args}</pre>
  return <span className="tool-body-muted">(running)</span>
}

function renderText(view: unknown): string {
  if (view === null || view === undefined) return ''
  try {
    const safe = JSON.parse(JSON.stringify(view)) as { card?: string }
    const { card, ...rest } = safe
    return JSON.stringify(rest, null, 2)
  } catch {
    return String(view)
  }
}

export function ToolCallCard({ block }: { block: ToolCallBlock }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const settled = isSettled(block)
  const name = toolName(block)
  const summary = deriveSummary(block)
  const isError = settled && block.isError === true
  // 耗时读数(R4:只用 wire 真实字段,禁止伪造):running→执行中…、
  // err→失败、settled 有 callTime 配对→x.xs(time-callTime),无耗时数据→—。
  const sec = settled ? settledDurationSec(block) : null
  const dur = !settled ? '执行中…' : isError ? '失败' : sec === null ? '—' : `${sec.toFixed(1)}s`
  const state = !settled ? 'run' : isError ? 'err' : 'ok'
  // SET D 状态图标(DESIGN.md §2.5):run→扰码 / ok→锁定勾 / err→故障切片;判定逻辑不变。
  const stateIcon: StatusIconKind = !settled ? 'run' : isError ? 'err' : 'done'

  return (
    <div
      className={`tool-line ${state}`}
      data-tool={name}
      data-state={settled ? (isError ? 'error' : 'done') : 'running'}
    >
      {!settled && (
        <>
          <span className="t-cnr t-cnr--tl" aria-hidden="true">⌜</span>
          <span className="t-cnr t-cnr--tr" aria-hidden="true">⌝</span>
          <span className="t-cnr t-cnr--bl" aria-hidden="true">⌞</span>
          <span className="t-cnr t-cnr--br" aria-hidden="true">⌟</span>
        </>
      )}
      <button
        className={`t-head${expanded ? ' open' : ''}`}
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        <StatusIcon kind={stateIcon} className="t-ic" />
        <span className="t-name">{TOOL_TITLES[name] ?? name}</span>
        <span className="t-desc">{summary}</span>
        <span className="t-dur">{dur}</span>
      </button>
      {expanded && (
        <div className="t-expand">
          <div className="t-ex-title">⎿ {name} → {summary}</div>
          <ToolBody block={block} />
        </div>
      )}
    </div>
  )
}
