'use client'

import { Check, CircleDashed, ShieldCheck, X } from 'lucide-react'
import { formatConfidence, formatLocation } from '@/lib/domain/labels'
import type { AttackChain } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3 rounded-md border bg-card p-5', className)}>
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </section>
  )
}

function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
          {item}
        </li>
      ))}
    </ul>
  )
}

export function ChainDefender({
  chain,
  selectedBreakPointId,
  onSelectBreakPoint,
}: {
  chain: AttackChain
  selectedBreakPointId: string | null
  onSelectBreakPoint: (id: string) => void
}) {
  const stepOrder = new Map(chain.steps.map((s) => [s.id, s.order]))
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="How to break the chain" className="lg:col-span-2">
        {chain.breakPoints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No break points could be grounded in the evidence for this chain.</p>
        ) : (
          <ol className="grid gap-3 md:grid-cols-2">
            {chain.breakPoints.map((bp, i) => (
              <li key={bp.id}>
                <button
                  type="button"
                  onClick={() => onSelectBreakPoint(bp.id)}
                  aria-pressed={selectedBreakPointId === bp.id}
                  className={cn(
                    'flex h-full w-full flex-col gap-2 rounded-md border border-dashed border-verified/40 p-4 text-left transition-colors hover:border-verified',
                    selectedBreakPointId === bp.id && 'border-solid border-verified bg-verified/5',
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wider text-verified">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck aria-hidden className="size-3.5" /> Break point {i + 1}
                    </span>
                    <span className="text-muted-foreground">
                      Steps {bp.affectedStepIds.map((id) => stepOrder.get(id)).filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <span className="font-medium leading-snug">{bp.title}</span>
                  <span className="text-sm leading-relaxed text-muted-foreground">{bp.recommendation}</span>
                  <span className="mt-auto font-mono text-[11px] text-primary">{formatLocation(bp.location)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel title="Impact">
        <p className="text-sm leading-relaxed">{chain.impact.summary}</p>
        {chain.impact.assetsAtRisk.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Assets at risk</span>
            <Bullets items={chain.impact.assetsAtRisk} empty="" />
          </div>
        )}
      </Panel>

      <Panel title="Preconditions">
        <Bullets items={chain.preconditions} empty="No preconditions recorded." />
      </Panel>

      <Panel title="Why this confidence">
        <p className="text-sm text-muted-foreground">
          Chain confidence <span className="font-mono text-foreground">{formatConfidence(chain.confidence)}</span>, derived from
          validation checks rather than model certainty.
        </p>
        <ul className="flex flex-col gap-2">
          {chain.confidenceChecks.map((check) => (
            <li key={check.label} className="flex gap-2 text-sm">
              {check.status === 'met' ? (
                <Check aria-label="Met" className="mt-0.5 size-4 shrink-0 text-verified" />
              ) : check.status === 'unmet' ? (
                <X aria-label="Not met" className="mt-0.5 size-4 shrink-0 text-destructive" />
              ) : (
                <CircleDashed aria-label="Unavailable" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex flex-col gap-0.5">
                <span>{check.label}</span>
                {check.detail && <span className="text-xs text-muted-foreground">{check.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Assumptions & limitations">
        <Bullets items={[...chain.assumptions, ...chain.limitations]} empty="None recorded." />
      </Panel>
    </div>
  )
}
