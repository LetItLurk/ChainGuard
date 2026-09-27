import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { ConfidenceMeter, SeverityBadge, SupportLevelBadge } from '@/components/chainguard/badges'
import type { AttackChain } from '@/lib/domain/schemas'

export function ChainCard({
  analysisId,
  chain,
  support,
}: {
  analysisId: string
  chain: AttackChain
  support: { verified: number; total: number }
}) {
  const href = `/analyses/${analysisId}/chains/${chain.id}`
  return (
    <article className="group relative flex flex-col gap-4 rounded-md border bg-card p-5 transition-colors hover:border-primary/50">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-primary">{chain.id}</span>
          <SeverityBadge severity={chain.severity} />
          <SupportLevelBadge level={chain.supportLevel} />
        </div>
        <h3 className="text-pretty font-medium leading-snug">
          <Link href={href} className="after:absolute after:inset-0 focus-visible:outline-none">
            {chain.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{chain.summary}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Entry point</dt>
          <dd className="truncate font-mono text-xs">
            {chain.entryPoint.contract}.{chain.entryPoint.function}()
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Steps</dt>
          <dd className="font-mono text-xs tabular-nums">{chain.steps.length}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Evidence verified</dt>
          <dd className="font-mono text-xs tabular-nums">
            {support.verified}/{support.total}
          </dd>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Contracts involved</dt>
          <dd className="flex flex-wrap gap-1">
            {chain.contractsInvolved.map((c) => (
              <span key={c} className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {c}
              </span>
            ))}
          </dd>
        </div>
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">Confidence</dt>
          <dd>
            <ConfidenceMeter value={chain.confidence} />
          </dd>
        </div>
      </dl>

      <footer className="flex items-end justify-between gap-4 border-t pt-3">
        <p className="text-sm">
          <span className="text-muted-foreground">Impact: </span>
          {chain.impact.assetsAtRisk[0] ?? chain.impact.summary}
        </p>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </footer>
    </article>
  )
}
