/**
 * GoalBar — the composer's goal strip (functional wiring, M2; 2026-08-21 Matrix
 * 风格化重设计). Reads the selected session's `goal` projection (useGoal); 无目标
 * 时整条隐藏(2026-08-21,对齐官方——官方仅以 hasGoal 做 /goal hint 消歧;
 * 创建入口 = /goal slash 命令,见 ui-change-log 2026-08-21--hide-idle-goal-bar.md);
 * when a goal exists it shows 靶标 SVG + 相位标签 + 目标文本 +
 * 右侧动作组(pause↔resume 切换 / edit / complete / clear)via the goal.*
 * contract. 三态编舞:active=磷光绿旋转环,paused=琥珀静止,blocked=橙红
 * glitch;受阻相不显示 pause/resume 切换钮(对齐官方,见 ui-change-log
 * 2026-08-21--goal-bar-blocked-no-toggle.md)。动作全部接 goalActions;
 * complete 保留接 goals/complete RPC。编辑交互保持既有 GoalForm 表单语义,
 * 只换视觉。/goal slash command stays the alternate path.
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime, type GoalProjectionValue } from '../app/runtime.tsx'

/** 相位标签(demo GOAL_PHASES;complete 相沿用既有 PHASE_LABEL 文案)。 */
const PHASE_LABEL: Record<GoalProjectionValue['goal']['phase'], string> = {
  active: '进行中的目标',
  paused: '已暂停的目标',
  blocked: '受阻的目标',
  complete: '已完成',
}

/** 靶标 SVG(demo GOAL_TARGET_SVG):双环 + 核心;active 外环旋转由 CSS 驱动。 */
function GoalTarget(): JSX.Element {
  return (
    <svg className="goal-bar-target" viewBox="0 0 18 18" aria-hidden="true">
      <circle className="goal-bar-target-outer" cx="9" cy="9" r="7.4" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="9 5" />
      <circle cx="9" cy="9" r="3.6" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle className="goal-bar-target-core" cx="9" cy="9" r="1.5" fill="currentColor" />
    </svg>
  )
}

/* 自绘 Matrix 风动作图标(demo G_ICON 移植):细线尖角、currentColor 继承状态色。 */
function EditIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <path d="M8.6 2.2l3.2 3.2L6 11.2H2.8V8L8.6 2.2z" strokeLinejoin="miter" />
      <path d="M7.4 3.4l3.2 3.2" />
      <path d="M1.5 12.8h11" opacity="0.45" />
    </svg>
  )
}

function CompleteIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <circle cx="7" cy="7" r="5.6" strokeDasharray="8 3.2" />
      <path d="M4.3 7.3l1.9 1.9 3.4-3.9" strokeWidth="1.2" />
    </svg>
  )
}

function ClearIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <path d="M2.6 3.8h8.8" />
      <path d="M5.4 3.8V2.4h3.2v1.4" />
      <path d="M4 3.8l.7 8.2h4.6l.7-8.2" strokeLinejoin="miter" />
      <path d="M6 6.2v4M8 6.2v4" opacity="0.5" />
    </svg>
  )
}

interface GoalBarFormProps {
  initial: { objective: string; maxGoalRounds?: number }
  submitLabel: string
  onSubmit: (objective: string, maxGoalRounds: number | undefined) => Promise<boolean>
  onCancel: () => void
}

function GoalForm({ initial, submitLabel, onSubmit, onCancel }: GoalBarFormProps): JSX.Element {
  const [objective, setObjective] = useState(initial.objective)
  const [maxRounds, setMaxRounds] = useState(initial.maxGoalRounds === undefined ? '' : String(initial.maxGoalRounds))
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async (): Promise<void> => {
    const text = objective.trim()
    if (text === '' || busy) return
    setBusy(true)
    const rounds = maxRounds.trim() === '' ? undefined : Number(maxRounds)
    const ok = await onSubmit(text, rounds === undefined || Number.isNaN(rounds) ? undefined : rounds)
    setBusy(false)
    if (ok) onCancel()
  }

  return (
    <div className="goal-bar-form">
      <input
        ref={inputRef}
        className="goal-bar-form-objective"
        placeholder="输入目标，智能体将持续执行…"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
          if (e.key === 'Escape') onCancel()
        }}
        aria-label="目标"
      />
      <input
        className="goal-bar-form-rounds"
        placeholder="上限轮次（可选）"
        value={maxRounds}
        onChange={(e) => setMaxRounds(e.target.value)}
        aria-label="上限轮次"
      />
      <button type="button" className="goal-bar-btn" onClick={() => void submit()} disabled={objective.trim() === '' || busy}>{submitLabel}</button>
      <button type="button" className="goal-bar-btn goal-bar-btn-ghost" onClick={onCancel}>取消</button>
    </div>
  )
}

export function GoalBar(): JSX.Element | null {
  const { useGoal, goalActions, selectedSessionId } = useRuntime()
  const goal = useGoal(s => s) as GoalProjectionValue | null | undefined
  const [mode, setMode] = useState<'idle' | 'create' | 'edit'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Close forms when the session changes.
  useEffect(() => {
    setMode('idle')
    setError(null)
  }, [selectedSessionId])

  const current = goal?.goal ?? null

  const run = async (fn: () => Promise<boolean>): Promise<void> => {
    setError(null)
    if (!(await fn())) setError('操作失败')
  }

  if (mode === 'create') {
    return (
      <div className="goal-bar">
        <GoalForm
          initial={{ objective: '' }}
          submitLabel="设定"
          onCancel={() => setMode('idle')}
          onSubmit={async (objective, maxGoalRounds) => {
            if (!(await goalActions.create(objective, maxGoalRounds))) {
              setError('创建目标失败（可能已存在未完成目标）')
              return false
            }
            setError(null)
            return true
          }}
        />
        {error !== null && <div className="goal-bar-error">{error}</div>}
      </div>
    )
  }

  if (current === undefined || current === null) {
    // 2026-08-21:无目标时整条隐藏(用户要求 + 对齐官方——官方仅以 hasGoal
    // 做 /goal hint 消歧,无目标不渲染 goal 条);创建入口 = /goal slash 命令
    // (见 ui-change-log 2026-08-21--hide-idle-goal-bar.md)。create 表单分支
    // 保留,供未来入口复用。
    if (mode === 'idle') return null
    return (
      <div className="goal-bar" data-has-goal={undefined}>
        <GoalTarget />
        <span className="goal-bar-phase goal-bar-phase-empty">未设定目标</span>
        <span className="goal-bar-controls">
          <button type="button" className="goal-bar-btn" onClick={() => setMode('create')}>＋ 设定目标</button>
        </span>
      </div>
    )
  }

  if (mode === 'edit') {
    return (
      <div className="goal-bar" data-has-goal="true" data-phase={current.phase}>
        <GoalForm
          initial={{ objective: current.objective, maxGoalRounds: current.maxGoalRounds }}
          submitLabel="保存"
          onCancel={() => setMode('idle')}
          onSubmit={async (objective, maxGoalRounds) => {
            if (!(await goalActions.edit(current, { objective, ...(maxGoalRounds === undefined ? {} : { maxGoalRounds }) }))) {
              setError('编辑目标失败')
              return false
            }
            setError(null)
            return true
          }}
        />
        {error !== null && <div className="goal-bar-error">{error}</div>}
      </div>
    )
  }

  return (
    <div className="goal-bar" data-has-goal="true" data-phase={current.phase}>
      <GoalTarget />
      <span className="goal-bar-phase" data-phase={current.phase}>{PHASE_LABEL[current.phase]}</span>
      <span className="goal-bar-objective-text" title={current.objective}>{current.objective}</span>
      <span className="goal-bar-controls">
        {/* pause↔resume 切换钮:active 显 ⏸、paused 显 ▶;blocked 不显示(对齐官方)。 */}
        {current.phase === 'active' && (
          <button type="button" className="goal-bar-btn goal-bar-btn-warn" data-action="pause" title="暂停目标" onClick={() => void run(() => goalActions.pause(current))}>⏸</button>
        )}
        {current.phase === 'paused' && (
          <button type="button" className="goal-bar-btn" data-action="resume" title="恢复目标" onClick={() => void run(() => goalActions.resume(current))}>▶</button>
        )}
        <button type="button" className="goal-bar-btn" data-action="edit" title="编辑目标" onClick={() => setMode('edit')}><EditIcon /></button>
        {current.phase !== 'complete' && (
          <button type="button" className="goal-bar-btn" data-action="complete" title="完成目标" onClick={() => void run(() => goalActions.complete(current))}><CompleteIcon /></button>
        )}
        <button type="button" className="goal-bar-btn goal-bar-btn-danger" data-action="clear" title="清除目标" onClick={() => void run(() => goalActions.clear(current))}><ClearIcon /></button>
      </span>
      {error !== null && <div className="goal-bar-error">{error}</div>}
    </div>
  )
}
