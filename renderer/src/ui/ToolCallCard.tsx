/**
 * M3 — ToolCallCard (Q19A self-authored presentational layer).
 *
 * Renders one atomic tool call as a foldable row: icon + vendor title +
 * summary; expanding reveals call args and the card body (terminal/diff/read/
 * search/web by resultView.card, else IN/OUT text). Mirrors the official
 * ToolRow + GenericToolCard posture at the level this milestone needs.
 */
import { useState } from 'react'
import type { RunningToolCall, ToolCallBlock, ToolResultNode } from '../../vendor/client-runtime/client/sessions/conversation.ts'

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

function toolTitle(name: string): string {
  if (TOOL_TITLES[name] !== undefined) return TOOL_TITLES[name]
  const variant = classifyTool(name)
  return variant === 'others' ? name : TOOL_TITLES[variant] ?? variant
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

/** Matrix diff 卡:校验环 + 文件头(+/- 计数/MODIFIED)+ 烧录显影行(M1 port from pi-martix) */
function MatrixDiffCard({ file, rows }: { file: string; rows: DiffRow[] }): JSX.Element {
  let plus = 0
  let minus = 0
  for (const r of rows) {
    if (r.t === '+') plus++
    else if (r.t === '-') minus++
  }
  const dFile = file.startsWith('✎ ') ? file : `✎ ${file}`
  return (
    <div className="matrix-diff">
      <svg className="matrix-diff-ring" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="1" y="1" width="98" height="98" pathLength={400} />
      </svg>
      <div className="matrix-diff-head">
        <span className="matrix-diff-file">{dFile}</span>
        <span className="matrix-diff-plus">+{plus}</span>
        <span className="matrix-diff-minus">−{minus}</span>
        <span className="matrix-diff-mod">MODIFIED</span>
      </div>
      <div className="matrix-diff-body">
        {rows.map((r, i) => (
          <div key={i} className={`matrix-diff-row ${r.t === '+' ? 'add' : r.t === '-' ? 'del' : 'ctx'}`}>
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

  return (
    <div
      className="tool-card"
      data-tool={name}
      data-state={settled ? (isError ? 'error' : 'done') : 'running'}
      data-variant="generic"
    >
      <button
        className="tool-card-row"
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(v => !v)}
      >
        <span className="tool-card-icon" aria-hidden="true">{settled ? (isError ? '✗' : '✓') : '…'}</span>
        <span className="tool-card-title">{toolTitle(name)}</span>
        <span className="tool-card-summary">{summary}</span>
      </button>
      {expanded && (
        <div className="tool-card-body">
          <ToolBody block={block} />
        </div>
      )}
    </div>
  )
}
