'use client'

import { Crosshair, ShieldCheck } from 'lucide-react'
import { ConfidenceMeter, CopyButton, VerificationBadge } from '@/components/chainguard/badges'
import { EVIDENCE_TYPE_LABEL, STEP_TYPE_LABEL, formatLocation } from '@/lib/domain/labels'
import type { AttackStep, BreakPoint, Evidence, SourceLocation } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'
import { STEP_TONE } from './step-tone'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm leading-relaxed">{children}</dd>
    </div>
  )
}

export function evidenceLocation(e: Evidence): SourceLocation | null {
  if (!e.sourceFile || !e.lineStart) return null
  return { file: e.sourceFile, lineStart: e.lineStart, lineEnd: e.lineEnd ?? e.lineStart }
}

function EvidenceList({
  items,
  focusedId,
  onFocus,
}: {
  items: Evidence[]
  focusedId: string | null
  onFocus: (evidence: Evidence) => void
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No evidence recorded for this step.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((e) => {
        const location = evidenceLocation(e)
        return (
          <li key={e.id}>
            <button
              type="button"
              disabled={!location}
              onClick={() => onFocus(e)}
              className={cn(
                'flex w-full flex-col gap-1.5 rounded-sm border px-2.5 py-2 text-left transition-colors enabled:hover:border-primary/50 disabled:cursor-default',
                focusedId === e.id && 'border-primary/60 bg-primary/5',
              )}
            >
              <span className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-mono text-muted-foreground">{e.id}</span>
                <CopyButton text={e.id} label="Copy ID" />
                <span className="text-muted-foreground">{EVIDENCE_TYPE_LABEL[e.type]}</span>
                <span className="font-mono text-muted-foreground">· {e.source}</span>
                <VerificationBadge status={e.verificationStatus} className="ml-auto" />
              </span>
              <span className="text-[13px] leading-snug">{e.description}</span>
              {location && (
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-primary">{formatLocation(location)}</span>
                  <CopyButton text={formatLocation(location)} label="Copy location" />
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function StepDetails({
  step,
  steps,
  evidence,
  focusedEvidenceId,
  onFocusEvidence,
  onSelectStep,
}: {
  step: AttackStep
  steps: AttackStep[]
  evidence: Evidence[]
  focusedEvidenceId: string | null
  onFocusEvidence: (e: Evidence) => void
  onSelectStep: (id: string) => void
}) {
  const deps = step.dependencies.map((id) => steps.find((s) => s.id === id)).filter((s): s is AttackStep => Boolean(s))
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className={cn('font-mono text-[11px] uppercase tracking-wider', STEP_TONE[step.type].text)}>
          Step {step.order} · {STEP_TYPE_LABEL[step.type]}
        </span>
        <h3 className="text-pretty font-medium leading-snug">{step.title}</h3>
        <p className="font-mono text-xs text-muted-foreground">
          {step.contract ?? 'External'}
          {step.function ? `.${step.function}()` : ''} · {formatLocation(step.sourceLocation)}
        </p>
      </header>
      <dl className="flex flex-col gap-3">
        <Field label="What happens">{step.description}</Field>
        <Field label="Why it is included">{step.reason}</Field>
        {deps.length > 0 && (
          <Field label="Depends on">
            <span className="flex flex-wrap gap-1.5">
              {deps.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectStep(d.id)}
                  className="rounded-sm border px-1.5 py-0.5 font-mono text-xs text-primary hover:border-primary/50"
                >
                  Step {d.order}
                </button>
              ))}
            </span>
          </Field>
        )}
        {step.findingIds.length > 0 && (
          <Field label="Findings">
            <span className="font-mono text-xs">{step.findingIds.join(', ')}</span>
          </Field>
        )}
        {step.assumptions.length > 0 && (
          <Field label="Assumptions">
            <ul className="list-disc pl-4 text-muted-foreground">
              {step.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Field>
        )}
        <Field label="Step confidence">
          <ConfidenceMeter value={step.confidence} label="Step confidence" />
        </Field>
      </dl>
      <section className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Crosshair aria-hidden className="size-3" /> Supporting evidence
        </h4>
        <EvidenceList items={evidence} focusedId={focusedEvidenceId} onFocus={onFocusEvidence} />
      </section>
    </div>
  )
}

export function BreakPointDetails({
  breakPoint,
  index,
  steps,
  onSelectStep,
}: {
  breakPoint: BreakPoint
  index: number
  steps: AttackStep[]
  onSelectStep: (id: string) => void
}) {
  const affected = steps.filter((s) => breakPoint.affectedStepIds.includes(s.id))
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-verified">
          <ShieldCheck aria-hidden className="size-3" /> Break point {index + 1}
        </span>
        <h3 className="text-pretty font-medium leading-snug">{breakPoint.title}</h3>
        <p className="font-mono text-xs text-muted-foreground">
          {breakPoint.location.contract}
          {breakPoint.location.function ? `.${breakPoint.location.function}()` : ''} · {formatLocation(breakPoint.location)}
        </p>
      </header>
      <dl className="flex flex-col gap-3">
        <Field label="Recommendation">{breakPoint.recommendation}</Field>
        <Field label="Why this breaks the chain">{breakPoint.rationale}</Field>
        <Field label="Interrupts">
          <span className="flex flex-wrap gap-1.5">
            {affected.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectStep(s.id)}
                className="rounded-sm border px-1.5 py-0.5 text-xs hover:border-primary/50"
              >
                <span className="font-mono text-primary">{s.order}</span> {s.title}
              </button>
            ))}
          </span>
        </Field>
        <Field label="Confidence">
          <ConfidenceMeter value={breakPoint.confidence} />
        </Field>
      </dl>
    </div>
  )
}
