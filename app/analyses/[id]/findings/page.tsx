import type { Metadata } from 'next'
import { FindingsTable } from '@/components/chainguard/findings/findings-table'
import { loadCompleteAnalysis } from '@/lib/api/loaders'

export const metadata: Metadata = { title: 'Findings' }

export default async function FindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const analysis = await loadCompleteAnalysis(id)
  if (!analysis) return null

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-medium">Findings</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Individual findings from static detectors and the repository mapper, with their relationship to attack chains
          and validation status.
        </p>
      </header>
      <FindingsTable analysisId={analysis.id} findings={analysis.findings} evidence={analysis.evidence} />
    </main>
  )
}
