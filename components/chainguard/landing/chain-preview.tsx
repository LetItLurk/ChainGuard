import Link from 'next/link'
import { ModeBadge, SeverityBadge } from '@/components/chainguard/badges'
import { STEP_TYPE_LABEL } from '@/lib/domain/labels'
import type { AttackChain } from '@/lib/domain/schemas'

export function ChainPreview({ chain }: { chain: AttackChain }) {
  return (
    <figure className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{chain.id}</span>
          <SeverityBadge severity={chain.severity} />
        </div>
        <ModeBadge mode="fixture" />
      </div>
      <div className="px-4 pt-4">
        <p className="font-medium text-pretty">{chain.title}</p>
      </div>
      <ol className="flex flex-col px-4 py-4">
        {chain.steps.slice(0, 6).map((step, i, arr) => (
          <li key={step.id} className="relative flex gap-3 pb-3 last:pb-0">
            {i < arr.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-full w-px bg-border" />}
            <span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-[11px]">
              {step.order}
            </span>
            <div className="min-w-0">
              <p className="text-sm">{step.title}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {STEP_TYPE_LABEL[step.type]} · {step.contract}
                {step.function ? `.${step.function}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <figcaption className="border-t px-4 py-3 text-sm">
        <Link href={`/analyses/demo/chains/${chain.id}`} className="text-primary underline-offset-4 hover:underline">
          Investigate this chain
        </Link>
      </figcaption>
    </figure>
  )
}
