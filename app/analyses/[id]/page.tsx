import type { Metadata } from 'next'
import { AnalysisProgress } from '@/components/chainguard/analysis/analysis-progress'
import { OverviewDashboard } from '@/components/chainguard/overview/overview-dashboard'
import { loadAnalysis } from '@/lib/api/loaders'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const result = await loadAnalysis(id)
  return { title: result.ok ? `${result.analysis.repository.name} · Overview` : 'Analysis' }
}

export default async function AnalysisOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await loadAnalysis(id)
  if (!result.ok) return null
  const { analysis } = result

  if (analysis.status !== 'complete') {
    return (
      <AnalysisProgress
        id={analysis.id}
        initial={{ id: analysis.id, status: analysis.status, stages: analysis.stages, error: null }}
      />
    )
  }
  return <OverviewDashboard analysis={analysis} />
}
