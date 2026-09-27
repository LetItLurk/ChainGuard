import { SiteHeader } from '@/components/chainguard/site-header'
import { AnalysisHeader } from '@/components/chainguard/analysis/analysis-header'
import { ServiceUnavailable } from '@/components/chainguard/analysis/service-unavailable'
import { loadAnalysis } from '@/lib/api/loaders'

export default async function AnalysisLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await loadAnalysis(id)
  return (
    <>
      <SiteHeader />
      {result.ok ? (
        <>
          <AnalysisHeader analysis={result.analysis} />
          {children}
        </>
      ) : (
        <ServiceUnavailable message={result.message} />
      )}
    </>
  )
}
