import Link from 'next/link'
import { AlertTriangle, Info } from 'lucide-react'
import { ChainCard } from '@/components/chainguard/chains/chain-card'
import { StageList } from '@/components/chainguard/analysis/stage-list'
import { SEVERITY_DOT } from '@/components/chainguard/badges'
import { SEVERITY_LABEL, SEVERITY_ORDER } from '@/lib/domain/labels'
import { bySeverity, evidenceSupport, indexEvidence, severityCounts, summarizeFindings } from '@/lib/domain/queries'
import type { Analysis } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'

const STATIC_MESSAGE: Record<Analysis['staticAnalysis']['status'], string | null> = {
  complete: null,
  fixture: null,
  failed: 'Static analysis failed for this repository. Review the analysis diagnostics.',
  unavailable: 'Static analysis was unavailable for this run. Findings rely on the repository mapper only.',
}

const AI_MESSAGE: Record<Analysis['aiStatus'], string | null> = {
  complete: null,
  fixture: null,
  unavailable: 'AI investigation is temporarily unavailable. Static-analysis results remain available.',
  skipped: 'AI investigation was skipped for this run. Attack chains come from deterministic heuristics only.',
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xl tabular-nums">{value}</dd>
    </div>
  )
}

export function OverviewDashboard({ analysis }: { analysis: Analysis }) {
  const { repository } = analysis
  const findings = summarizeFindings(analysis.findings)
  const evidenceIndex = indexEvidence(analysis.evidence)
  const chains = [...analysis.attackChains].sort(bySeverity)
  const sev = severityCounts(analysis.findings)
  const notices = [STATIC_MESSAGE[analysis.staticAnalysis.status], AI_MESSAGE[analysis.aiStatus]].filter(Boolean) as string[]

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6">
      {analysis.mode === 'fixture' && (
        <p className="flex items-start gap-2 rounded-md border border-partial/40 bg-partial/5 px-4 py-3 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-partial" />
          <span>
            <strong className="font-medium">Demo Analysis.</strong> These results are pre-recorded fixture data for the
            intentionally vulnerable contracts in <code className="font-mono text-xs">contracts/vulnerable</code>. They
            were not produced by a live run.
          </span>
        </p>
      )}

      {notices.map((message) => (
        <p key={message} role="status" className="flex items-start gap-2 rounded-md border border-partial/40 px-4 py-3 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-partial" />
          {message}
        </p>
      ))}

      <section aria-labelledby="summary-heading" className="grid gap-px overflow-hidden rounded-md border bg-border lg:grid-cols-[1.4fr_1fr_1fr]">
        <h2 id="summary-heading" className="sr-only">
          Investigation summary
        </h2>
        <div className="flex flex-col justify-between gap-4 bg-card p-6">
          <p className="text-sm text-muted-foreground">Potential attack chains</p>
          <p className="font-mono text-5xl font-medium tabular-nums text-primary">{analysis.attackChains.length}</p>
          <p className="text-sm text-muted-foreground">
            {findings.inChains} of {findings.total} findings connect into a chain.
          </p>
        </div>
        <div className="flex flex-col justify-between gap-4 bg-card p-6">
          <p className="text-sm text-muted-foreground">Potential findings</p>
          <p className="font-mono text-4xl tabular-nums">{findings.total}</p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {SEVERITY_ORDER.filter((s) => sev[s] > 0).map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-1.5 rounded-full', SEVERITY_DOT[s])} />
                {sev[s]} {SEVERITY_LABEL[s]}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-between gap-4 bg-card p-6">
          <p className="text-sm text-muted-foreground">Isolated findings</p>
          <p className="font-mono text-4xl tabular-nums">{findings.isolated}</p>
          <p className="text-xs text-muted-foreground">
            {findings.unverified} unverified · {findings.related} related
          </p>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="chains-heading" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 id="chains-heading" className="font-medium">
              Attack chains
            </h2>
            <Link href={`/analyses/${analysis.id}/findings`} className="text-sm text-muted-foreground hover:text-foreground">
              View all findings
            </Link>
          </div>
          {chains.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No connected attack chains were established from the available evidence.
            </p>
          ) : (
            <div className="grid gap-4">
              {chains.map((chain) => (
                <ChainCard key={chain.id} analysisId={analysis.id} chain={chain} support={evidenceSupport(chain, evidenceIndex)} />
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <section aria-labelledby="repo-heading" className="rounded-md border bg-card">
            <h2 id="repo-heading" className="border-b px-4 py-3 text-sm font-medium">
              Repository map
            </h2>
            <dl className="grid grid-cols-2 gap-px border-b bg-border">
              <Stat label="Contracts" value={repository.contractsCount} />
              <Stat label="Functions" value={repository.functionsCount} />
              <Stat label="External calls" value={repository.externalCallsCount} />
              <Stat label="Privileged functions" value={repository.privilegedFunctionsCount} />
              <Stat label="Oracle dependencies" value={repository.oracleDependenciesCount} />
              <Stat label="Solidity files" value={repository.solidityFiles.length} />
            </dl>
            <ul className="flex flex-col gap-1 px-4 py-3">
              {repository.solidityFiles.map((file) => (
                <li key={file} className="truncate font-mono text-xs text-muted-foreground">
                  {file}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="pipeline-heading" className="rounded-md border bg-card">
            <div className="flex items-baseline justify-between border-b px-4 py-3">
              <h2 id="pipeline-heading" className="text-sm font-medium">
                Pipeline
              </h2>
              <span className="text-xs text-muted-foreground">
                {analysis.staticAnalysis.tool} · {analysis.staticAnalysis.status}
              </span>
            </div>
            <div className="px-4">
              <StageList stages={analysis.stages} dense />
            </div>
          </section>

          {analysis.diagnostics.length > 0 && (
            <section aria-labelledby="diag-heading" className="rounded-md border bg-card">
              <h2 id="diag-heading" className="border-b px-4 py-3 text-sm font-medium">
                Diagnostics
              </h2>
              <ul className="flex flex-col divide-y">
                {analysis.diagnostics.map((d, i) => (
                  <li key={i} className="flex flex-col gap-0.5 px-4 py-2.5 text-xs">
                    <span className={cn('font-mono uppercase', d.level === 'error' ? 'text-destructive' : d.level === 'warning' ? 'text-partial' : 'text-muted-foreground')}>
                      {d.level} · {d.stage}
                    </span>
                    <span className="text-muted-foreground">{d.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
  )
}
