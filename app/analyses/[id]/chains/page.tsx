import type { Metadata } from 'next'
import { ChainCard } from '@/components/chainguard/chains/chain-card'
import { loadCompleteAnalysis } from '@/lib/api/loaders'
import { bySeverity, evidenceSupport, indexEvidence } from '@/lib/domain/queries'

export const metadata: Metadata = { title: 'Attack chains' }

export default async function ChainsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const analysis = await loadCompleteAnalysis(id)
  if (!analysis) return null
  const evidenceIndex = indexEvidence(analysis.evidence)
  const chains = [...analysis.attackChains].sort(bySeverity)

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Potential attack chains</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Each chain connects findings through call, state, or oracle dependencies in the repository map. Confidence is
          derived from how much of the chain&apos;s evidence was validated against source, not from model certainty.
        </p>
      </header>
      {chains.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-sm text-muted-foreground">
          No connected attack chains were established from the available evidence.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {chains.map((chain) => (
            <ChainCard key={chain.id} analysisId={analysis.id} chain={chain} support={evidenceSupport(chain, evidenceIndex)} />
          ))}
        </div>
      )}
    </main>
  )
}
