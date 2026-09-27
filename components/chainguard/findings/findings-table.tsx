'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { CopyButton, RelationshipBadge, SeverityBadge, SupportBadge, VerificationBadge } from '@/components/chainguard/badges'
import { CATEGORY_LABEL, EVIDENCE_TYPE_LABEL, RELATIONSHIP_LABEL, formatConfidence, formatLocation } from '@/lib/domain/labels'
import { bySeverity } from '@/lib/domain/queries'
import type { Evidence, Finding, RelationshipStatus } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'

type Filter = 'all' | RelationshipStatus
const FILTERS: Filter[] = ['all', 'chain', 'related', 'isolated', 'unverified']

export function FindingsTable({
  analysisId,
  findings,
  evidence,
}: {
  analysisId: string
  findings: Finding[]
  evidence: Evidence[]
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const evidenceIndex = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence])
  const sorted = useMemo(() => [...findings].sort(bySeverity), [findings])
  const visible = filter === 'all' ? sorted : sorted.filter((f) => f.relationship === filter)

  if (findings.length === 0) {
    return <p className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">No findings were reported for this repository.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="toolbar" aria-label="Filter by relationship" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => {
          const count = f === 'all' ? findings.length : findings.filter((x) => x.relationship === f).length
          return (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition-colors',
                filter === f ? 'border-primary/50 bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f === 'all' ? 'All' : RELATIONSHIP_LABEL[f]}
              <span className="font-mono tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-md border">
        <div className="hidden grid-cols-[6rem_1fr_12rem_10rem_9rem] gap-4 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground md:grid">
          <span>Severity</span>
          <span>Finding</span>
          <span>Location</span>
          <span>Relationship</span>
          <span>Validation</span>
        </div>
        {visible.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No findings match this filter.</p>
        ) : (
          <ul className="divide-y">
            {visible.map((finding) => (
              <FindingRow key={finding.id} analysisId={analysisId} finding={finding} evidenceIndex={evidenceIndex} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FindingRow({
  analysisId,
  finding,
  evidenceIndex,
}: {
  analysisId: string
  finding: Finding
  evidenceIndex: Map<string, Evidence>
}) {
  const refs = finding.evidenceReferences.map((id) => evidenceIndex.get(id)).filter((e): e is Evidence => Boolean(e))
  return (
    <li id={finding.id}>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-accent/40 md:grid-cols-[6rem_1fr_12rem_10rem_9rem] md:items-center md:gap-4 [&::-webkit-details-marker]:hidden">
          <span>
            <SeverityBadge severity={finding.severity} />
          </span>
          <span className="flex min-w-0 items-start gap-2">
            <ChevronRight aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{finding.title}</span>
              <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <span className="font-mono">{finding.id}</span>
                <CopyButton text={finding.id} label="Copy ID" />
                <span>·</span>
                <span>{CATEGORY_LABEL[finding.category]}</span>
                {finding.detector && <span className="font-mono"> · {finding.detector}</span>}
              </span>
            </span>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 font-mono text-xs">
            <span className="truncate">
              {finding.contract ?? 'Unknown contract'}
              {finding.function ? `.${finding.function}()` : ''}
            </span>
            <span className="truncate text-muted-foreground">{formatLocation(finding.sourceLocation)}</span>
          </span>
          <span>
            <RelationshipBadge relationship={finding.relationship} />
          </span>
          <span>
            <SupportBadge status={finding.status} />
          </span>
        </summary>
        <div className="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4 md:pl-[8rem]">
          <p className="max-w-3xl text-sm leading-relaxed">{finding.description}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Confidence <span className="font-mono text-foreground">{formatConfidence(finding.confidence)}</span>
            </span>
            {finding.relatedFindings.length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                Related:
                {finding.relatedFindings.map((id) => (
                  <a key={id} href={`#${id}`} className="font-mono text-primary hover:underline">
                    {id}
                  </a>
                ))}
              </span>
            )}
            {finding.chainIds.map((chainId) => (
              <Link key={chainId} href={`/analyses/${analysisId}/chains/${chainId}`} className="font-mono text-primary hover:underline">
                Investigate {chainId}
              </Link>
            ))}
          </div>
          {refs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {refs.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-muted-foreground">{e.id}</span>
                  <span className="text-muted-foreground">{EVIDENCE_TYPE_LABEL[e.type]}</span>
                  <VerificationBadge status={e.verificationStatus} />
                  <span>{e.description}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  )
}
