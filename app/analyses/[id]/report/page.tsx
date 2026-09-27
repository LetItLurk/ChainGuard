import type { Metadata } from 'next'
import { ReportDocument } from '@/components/chainguard/report/report-document'
import { ReportActions } from '@/components/chainguard/report/report-actions'
import { loadCompleteAnalysis } from '@/lib/api/loaders'

export const metadata: Metadata = { title: 'Report' }

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const analysis = await loadCompleteAnalysis(id)
  if (!analysis) return null

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Export this investigation for review or audit handoff.</p>
        <ReportActions analysisId={analysis.id} />
      </div>
      <ReportDocument analysis={analysis} />
    </main>
  )
}
