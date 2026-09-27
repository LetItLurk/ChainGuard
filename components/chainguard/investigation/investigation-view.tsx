'use client'

import { useMemo, useState } from 'react'
import { CodeViewer } from '@/components/chainguard/code-viewer'
import type { AttackChain, Evidence, SourceFile, SourceLocation } from '@/lib/domain/schemas'
import { AttackGraph, type GraphSelection } from './attack-graph'
import { BreakPointDetails, StepDetails, evidenceLocation } from './evidence-panel'
import { StepList } from './step-list'
import { ChainDefender } from './chain-defender'

export function InvestigationView({
  chain,
  evidence,
  sources,
  initialStepId,
}: {
  chain: AttackChain
  evidence: Evidence[]
  sources: SourceFile[]
  initialStepId?: string
}) {
  const firstStep = chain.steps.find((s) => s.id === initialStepId) ?? chain.steps[0]
  const [selection, setSelection] = useState<GraphSelection>({ kind: 'step', id: firstStep.id })
  const [focus, setFocus] = useState<{ evidenceId: string; location: SourceLocation } | null>(null)

  const evidenceIndex = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence])
  const sourceIndex = useMemo(() => new Map(sources.map((s) => [s.path, s.content])), [sources])

  const selectedStep = selection.kind === 'step' ? chain.steps.find((s) => s.id === selection.id) : undefined
  const selectedBreakIndex = selection.kind === 'breakPoint' ? chain.breakPoints.findIndex((b) => b.id === selection.id) : -1
  const selectedBreak = selectedBreakIndex >= 0 ? chain.breakPoints[selectedBreakIndex] : undefined

  const highlighted = useMemo(
    () => new Set(selectedBreak ? selectedBreak.affectedStepIds : selectedStep ? [selectedStep.id] : []),
    [selectedBreak, selectedStep],
  )

  const location: SourceLocation | null =
    focus?.location ?? (selectedBreak ? selectedBreak.location : (selectedStep?.sourceLocation ?? null))

  const select = (next: GraphSelection) => {
    setSelection(next)
    setFocus(null)
  }
  const selectStep = (id: string) => select({ kind: 'step', id })
  const focusEvidence = (e: Evidence) => {
    const loc = evidenceLocation(e)
    if (loc) setFocus({ evidenceId: e.id, location: loc })
  }

  const stepEvidence = selectedStep
    ? selectedStep.evidence.map((id) => evidenceIndex.get(id)).filter((e): e is Evidence => Boolean(e))
    : []

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:h-[calc(100dvh-15rem)] lg:min-h-[640px] lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex max-h-80 min-h-0 flex-col overflow-hidden rounded-md border bg-card lg:max-h-none">
          <StepList steps={chain.steps} selectedId={selectedStep?.id ?? null} highlighted={highlighted} onSelect={selectStep} />
        </div>

        <section aria-label="Attack graph" className="relative hidden min-h-0 overflow-hidden rounded-md border bg-card/40 lg:block">
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-px w-4 bg-muted-foreground" /> Dependency
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-px w-4 border-t border-dashed border-verified" /> Break point
            </span>
          </div>
          <AttackGraph chain={chain} selection={selection} highlightedStepIds={highlighted} onSelect={select} />
        </section>

        <div className="flex min-h-0 flex-col gap-4">
          <section aria-label="Evidence" aria-live="polite" className="min-h-0 overflow-y-auto rounded-md border bg-card p-4 lg:max-h-[55%]">
            {selectedBreak ? (
              <BreakPointDetails breakPoint={selectedBreak} index={selectedBreakIndex} steps={chain.steps} onSelectStep={selectStep} />
            ) : selectedStep ? (
              <StepDetails
                step={selectedStep}
                steps={chain.steps}
                evidence={stepEvidence}
                focusedEvidenceId={focus?.evidenceId ?? null}
                onFocusEvidence={focusEvidence}
                onSelectStep={selectStep}
              />
            ) : null}
          </section>
          {location ? (
            <CodeViewer
              path={location.file}
              content={sourceIndex.get(location.file) ?? null}
              highlight={location}
              className="h-96 lg:h-auto lg:flex-1"
            />
          ) : (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No source location is recorded for this selection.
            </p>
          )}
        </div>
      </div>

      <ChainDefender
        chain={chain}
        selectedBreakPointId={selectedBreak?.id ?? null}
        onSelectBreakPoint={(id) => {
          select({ kind: 'breakPoint', id })
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    </div>
  )
}
