import { SeverityBadge, SupportBadge, RelationshipBadge } from '@/components/chainguard/badges'
import {
  CATEGORY_LABEL,
  STEP_TYPE_LABEL,
  SUPPORT_LEVEL_LABEL,
  formatConfidence,
  formatLocation,
} from '@/lib/domain/labels'
import { bySeverity, summarizeFindings } from '@/lib/domain/queries'
import type { Analysis } from '@/lib/domain/schemas'

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="border-b pb-2 text-lg font-medium tracking-tight">{children}</h2>
}

export function ReportDocument({ analysis }: { analysis: Analysis }) {
  const { repository } = analysis
  const summary = summarizeFindings(analysis.findings)
  const chains = [...analysis.attackChains].sort(bySeverity)
  const findings = [...analysis.findings].sort(bySeverity)

  return (
    <article className="flex flex-col gap-10 rounded-md border bg-card p-6 sm:p-10 print:border-0 print:p-0">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">ChainGuard investigation report</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight">{repository.name}</h1>
        {analysis.mode === 'fixture' && (
          <p className="rounded-sm border border-partial/40 bg-partial/5 px-3 py-2 text-sm">
            <strong className="font-medium">Demo Analysis.</strong> Pre-recorded fixture data; not produced by a live run.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Source</dt>
            <dd className="truncate font-mono text-xs">{repository.sourceReference}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Completed</dt>
            <dd className="font-mono text-xs">{analysis.completedAt ? new Date(analysis.completedAt).toUTCString() : 'n/a'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Static analysis</dt>
            <dd className="font-mono text-xs">
              {analysis.staticAnalysis.tool} · {analysis.staticAnalysis.status}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">AI investigation</dt>
            <dd className="font-mono text-xs">{analysis.aiStatus}</dd>
          </div>
        </dl>
      </header>

      <section className="flex flex-col gap-3">
        <H2>Executive summary</H2>
        <p className="leading-relaxed">
          ChainGuard identified <strong>{analysis.attackChains.length} potential attack chain(s)</strong> and{' '}
          <strong>{summary.total} potential finding(s)</strong> across {repository.contractsCount} contracts and{' '}
          {repository.functionsCount} functions. {summary.inChains} findings connect into chains, {summary.isolated} are
          isolated, and {summary.unverified} could not be validated.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          These are potential issues derived from static analysis and evidence-validated AI reasoning. They are not
          confirmed exploits and require manual verification.
        </p>
      </section>

      <section className="flex flex-col gap-8">
        <H2>Attack chains</H2>
        {chains.length === 0 && (
          <p className="text-muted-foreground">No connected attack chains were established from the available evidence.</p>
        )}
        {chains.map((chain) => (
          <div key={chain.id} className="flex flex-col gap-4 break-inside-avoid-page">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-primary">{chain.id}</span>
              <SeverityBadge severity={chain.severity} />
              <SupportBadge status={chain.status} />
              <span className="text-xs text-muted-foreground">
                {SUPPORT_LEVEL_LABEL[chain.supportLevel]} · confidence {formatConfidence(chain.confidence)}
              </span>
            </div>
            <h3 className="text-pretty text-lg font-medium">{chain.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{chain.summary}</p>
            <p className="text-sm">
              <span className="text-muted-foreground">Entry point: </span>
              <code className="font-mono text-xs">
                {chain.entryPoint.contract}.{chain.entryPoint.function}()
              </code>{' '}
              <span className="font-mono text-xs text-muted-foreground">{formatLocation(chain.entryPoint.sourceLocation)}</span>
            </p>
            <ol className="flex flex-col border-l">
              {chain.steps.map((step) => (
                <li key={step.id} className="relative flex flex-col gap-0.5 py-2 pl-5">
                  <span aria-hidden className="absolute -left-1 top-3.5 size-2 rounded-full bg-primary" />
                  <span className="text-sm">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{step.order}.</span>
                    {step.title}
                    <span className="ml-2 text-xs text-muted-foreground">{STEP_TYPE_LABEL[step.type]}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {formatLocation(step.sourceLocation)} · evidence {step.evidence.join(', ') || 'none'}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-sm leading-relaxed">
              <span className="font-medium">Impact. </span>
              {chain.impact.summary}
            </p>
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium">How to break the chain</h4>
              <ol className="flex flex-col gap-2">
                {chain.breakPoints.map((bp, i) => (
                  <li key={bp.id} className="rounded-sm border border-dashed border-verified/40 p-3 text-sm">
                    <p className="font-medium">
                      {i + 1}. {bp.title}{' '}
                      <span className="font-mono text-[11px] font-normal text-muted-foreground">{formatLocation(bp.location)}</span>
                    </p>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{bp.recommendation}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <H2>Findings</H2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="py-2 pr-3 font-normal">ID</th>
                <th scope="col" className="py-2 pr-3 font-normal">Severity</th>
                <th scope="col" className="py-2 pr-3 font-normal">Finding</th>
                <th scope="col" className="py-2 pr-3 font-normal">Location</th>
                <th scope="col" className="py-2 font-normal">Relationship</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {findings.map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="py-2 pr-3 font-mono text-xs">{f.id}</td>
                  <td className="py-2 pr-3">
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td className="py-2 pr-3">
                    {f.title}
                    <span className="block text-xs text-muted-foreground">{CATEGORY_LABEL[f.category]}</span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-[11px] text-muted-foreground">{formatLocation(f.sourceLocation)}</td>
                  <td className="py-2">
                    <RelationshipBadge relationship={f.relationship} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <H2>Methodology & limitations</H2>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Repository ingestion with path-traversal, size, and file-type guards. Repository code is never executed.</li>
          <li>Deterministic mapping of contracts, functions, external calls, state access, and oracle dependencies.</li>
          <li>Static analysis with Slither where available.</li>
          <li>AI investigation over a bounded context package; outputs are treated as candidates.</li>
          <li>Evidence validation of every contract, function, file, and line reference against the repository map.</li>
        </ol>
        {analysis.limitations.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            {analysis.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </section>
    </article>
  )
}
