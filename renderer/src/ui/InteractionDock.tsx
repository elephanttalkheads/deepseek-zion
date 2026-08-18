/**
 * M3 — InteractionDock (Q19A self-authored presentational layer).
 *
 * Renders the selected session's pending host interactions (snapshot.pending):
 *  - approval:  a tool-permission decision card (approve-once / reject), answered
 *               through the official PendingWait.respond carrier.
 *  - question:  a user-questions set (header/question/detail/options/multiSelect),
 *               collected into a structured AskUserQuestionAnswer and answered the
 *               same way.
 *
 * Both wait kinds settle through the resolved frame (approval/resolved or
 * question/resolved) — this component only answers; it never invents outcomes.
 */
import { useState } from 'react'
import { useRuntime } from '../app/runtime.tsx'
import type { PendingInteraction } from '../../vendor/client-runtime/client/sessions/pending.ts'

type Draft = { id: string; selected: string[]; custom?: string }

interface PlainQuestion {
  id: string; question: string; detail?: string; header?: string; multiSelect?: boolean
  options?: { label: string; description?: string }[]
}

function PlainQuestionCard({ question, value, onChange }: {
  question: PlainQuestion
  value: Draft | undefined
  onChange: (selected: string[]) => void
}): JSX.Element {
  const multi = question.multiSelect === true
  const options = question.options ?? []
  const selected = value?.selected ?? []
  const toggle = (label: string): void => {
    onChange(multi
      ? (selected.includes(label) ? selected.filter(x => x !== label) : [...selected, label])
      : [label])
  }
  return (
    <div className="interaction-question" data-multi={multi}>
      {question.header !== undefined && <div className="interaction-question-header">{question.header}</div>}
      <div className="interaction-question-text">{question.question}</div>
      {question.detail !== undefined && <div className="interaction-question-detail">{question.detail}</div>}
      <div className="interaction-question-options" role="group" aria-label={question.question}>
        {options.map(option => (
          <button
            key={option.label}
            type="button"
            className="interaction-option"
            data-selected={selected.includes(option.label)}
            aria-pressed={selected.includes(option.label)}
            onClick={() => toggle(option.label)}
          >
            <span className="interaction-option-label">{option.label}</span>
            {option.description !== undefined && <span className="interaction-option-desc">{option.description}</span>}
          </button>
        ))}
      </div>
      {multi ? (
        <span className="interaction-answer-hint">可多选：{selected.length === 0 ? '尚未选择' : `已选 ${selected.length} 项`}</span>
      ) : (
        <span className="interaction-answer-hint">{selected.length === 0 ? '尚未选择' : `已选择：${selected[0]}`}</span>
      )}
    </div>
  )
}

/** Render one pending entry; answering sends the domain result through wait.respond. */
function PendingRow({ pending }: { pending: PendingInteraction }): JSX.Element {
  const wait = pending
  if (wait.kind === 'approval') {
    const payload = wait.payload as { approvalId: string; toolName: string; reason?: string }
    return (
      <div className="interaction-card interaction-card--approval" data-kind="approval" data-tool={payload.toolName}>
        <div className="interaction-card-head">
          <span className="interaction-card-title">工具需要授权</span>
          <span className="interaction-tool">{payload.toolName}</span>
        </div>
        {payload.reason !== undefined && <div className="interaction-reason">{payload.reason}</div>}
        <div className="interaction-actions">
          <button type="button" className="interaction-btn interaction-btn--reject" onClick={() => void wait.respond({ ok: true, value: { sessionId: wait.sessionId, approvalId: payload.approvalId, outcome: 'rejected' } })}>拒绝</button>
          <button
            type="button" className="interaction-btn interaction-btn--allow"
            onClick={() => void wait.respond({ ok: true, value: { sessionId: wait.sessionId, approvalId: payload.approvalId, outcome: 'allowed-once' } })}
          >允许一次</button>
        </div>
      </div>
    )
  }
  // question
  const questions = (wait.payload as { questions: PlainQuestion[] }).questions ?? []
  const [drafts, setDrafts] = useState<Record<string, string[]>>({})
  const setSelected = (q: PlainQuestion, selected: string[]): void => {
    setDrafts(prev => ({ ...prev, [q.id]: selected }))
  }
  const allAnswered = questions.length > 0 && questions.every(q => (drafts[q.id] ?? []).length > 0)
  const answer = (): void => {
    void wait.respond({
      ok: true,
      value: {
        sessionId: wait.sessionId,
        answer: { answers: questions.map(q => ({ id: q.id, selected: drafts[q.id] ?? [] })) },
      },
    })
  }
  return (
    <div className="interaction-card interaction-card--question" data-kind="question">
      <div className="interaction-card-head"><span className="interaction-card-title">有几个问题需要确认</span></div>
      {questions.map(q => (
        <PlainQuestionCard
          key={q.id}
          question={q}
          value={drafts[q.id] === undefined ? undefined : { id: q.id, selected: drafts[q.id] }}
          onChange={selected => setSelected(q, selected)}
        />
      ))}
      <div className="interaction-actions">
        <button type="button" className="interaction-btn interaction-btn--reject" onClick={() => void wait.respond({ ok: false as const, error: { code: 'cancelled', message: 'cancelled', details: {} } })}>取消</button>
        <button type="button" className="interaction-btn interaction-btn--allow" disabled={!allAnswered} onClick={answer}>提交全部回答</button>
      </div>
    </div>
  )
}

export function InteractionDock(): JSX.Element | null {
  const { useConversation } = useRuntime()
  const pending = useConversation(s => s.pending)
  if (pending.length === 0) return null
  return (
    <div className="interaction-dock" data-count={pending.length}>
      {pending.map(p => <PendingRow key={p.key} pending={p} />)}
    </div>
  )
}
