import { ModeBadge } from '@/components/chainguard/badges'
import { AnalysisNav } from './analysis-nav'
import type { Analysis } from '@/lib/domain/schemas'

export function AnalysisHeader({ analysis }: { analysis: Analysis }) {
  const { repository } = analysis
  const complete = analysis.status === 'complete'
  return (
    <div className="print-hidden border-b">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-mono text-lg font-medium tracking-tight">{repository.name}</h1>
          <ModeBadge mode={analysis.mode} />
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {repository.sourceType === 'fixture' ? 'Fixture source · ' : ''}
          {repository.sourceReference}
        </p>
        <AnalysisNav
          id={analysis.id}
          disabled={!complete}
          counts={{ chains: analysis.attackChains.length, findings: analysis.findings.length }}
        />
      </div>
    </div>
  )
}
