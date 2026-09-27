import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ConfidenceMeter, SeverityBadge, SupportBadge, SupportLevelBadge } from '@/components/chainguard/badges'
import { InvestigationView } from '@/components/chainguard/investigation/investigation-view'
import { getSourceFiles } from '@/lib/api/analysis-service'
import { loadAnalysis, loadCompleteAnalysis } from '@/lib/api/loaders'
import { chainFiles, findChain } from '@/lib/domain/queries'
import type { SourceFile } from '@/lib/domain/schemas'

type Params = Promise<{ id: string; chainId: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, chainId } = await params
  const result = await loadAnalysis(id)
  const chain = result.ok ? findChain(result.analysis, chainId) : undefined
  return { title: chain ? `${chain.id} · ${chain.title}` : 'Attack chain' }
}

export default async function ChainInvestigationPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Promise<{ step?: string }>
}) {
  const { id, chainId } = await params
  const { step } = await searchParams
  const analysis = await loadCompleteAnalysis(id)
  if (!analysis) return null
  const chain = findChain(analysis, chainId)
  if (!chain) notFound()

  let sources: SourceFile[] = []
  let sourcesUnavailable = false
  try {
    sources = await getSourceFiles(analysis.id, chainFiles(chain))
  } catch {
    sourcesUnavailable = true
  }

  const evidenceIds = new Set([...chain.evidence, ...chain.steps.flatMap((s) => s.evidence)])
  const evidence = analysis.evidence.filter((e) => evidenceIds.has(e.id))

  return (
    <main className="mx-auto flex max-w-[96rem] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <Link
          href={`/analyses/${analysis.id}/chains`}
          className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-3" /> All attack chains
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-primary">{chain.id}</span>
          <SeverityBadge severity={chain.severity} />
          <SupportBadge status={chain.status} />
          <SupportLevelBadge level={chain.supportLevel} />
          <ConfidenceMeter value={chain.confidence} className="ml-1" />
        </div>
        <h2 className="text-balance text-xl font-medium tracking-tight">{chain.title}</h2>
        <p className="max-w-4xl text-pretty text-sm leading-relaxed text-muted-foreground">{chain.summary}</p>
        {sourcesUnavailable && (
          <p role="status" className="text-sm text-partial">
            Source files could not be loaded. Evidence locations are still listed.
          </p>
        )}
      </header>
      <InvestigationView chain={chain} evidence={evidence} sources={sources} initialStepId={step} />
    </main>
  )
}
