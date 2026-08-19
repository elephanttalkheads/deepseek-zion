/**
 * GoalBar — the composer's goal strip (functional wiring, M2). Reads the
 * selected session's `goal` projection (useGoal); when no goal exists it offers
 * a create form (objective + optional round cap) via goal.create; when a goal
 * exists it shows objective + phase + lifecycle controls (edit / pause /
 * resume / complete / clear) via the goal.* contract. Mirrors the official
 * «输入目标，智能体将持续执行» / «当前目标进行中» composer hints; the /goal slash
 * command stays the alternate path.
 */
import { useEffect, useRef, useState } from 'react'
import { useRuntime, type GoalProjectionValue } from '../app/runtime.tsx'

const PHASE_LABEL: Record<GoalProjectionValue['goal']['phase'], string> = {
  active: '进行中',
  paused: '已暂停',
  blocked: '受阻',
  complete: '已完成',
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

export function GoalBar(): JSX.Element {
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
    return (
      <div className="goal-bar" data-has-goal={undefined}>
        <div className="goal-bar-empty">
          <span className="goal-bar-hint">无目标 · 输入顶部文本框或点击“设定目标”开启长任务</span>
          <button type="button" className="goal-bar-btn" onClick={() => setMode('create')}>设定目标</button>
        </div>
      </div>
    )
  }

  if (mode === 'edit') {
    return (
      <div className="goal-bar" data-has-goal="true">
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
    <div className="goal-bar" data-has-goal="true">
      <span className="goal-bar-phase" data-phase={current.phase}>{PHASE_LABEL[current.phase]}</span>
      <span className="goal-bar-objective-text" title={current.objective}>{current.objective}</span>
      <span className="goal-bar-controls">
        <button type="button" className="goal-bar-btn" onClick={() => setMode('edit')}>edit</button>
        {current.phase === 'active' && (
          <button type="button" className="goal-bar-btn" onClick={() => void run(() => goalActions.pause(current))}>pause</button>
        )}
        {(current.phase === 'paused' || current.phase === 'blocked') && (
          <button type="button" className="goal-bar-btn" onClick={() => void run(() => goalActions.resume(current))}>resume</button>
        )}
        {current.phase !== 'complete' && (
          <button type="button" className="goal-bar-btn" onClick={() => void run(() => goalActions.complete(current))}>complete</button>
        )}
        <button type="button" className="goal-bar-btn goal-bar-btn-ghost" onClick={() => void run(() => goalActions.clear(current))}>clear</button>
      </span>
      {error !== null && <div className="goal-bar-error">{error}</div>}
    </div>
  )
}
