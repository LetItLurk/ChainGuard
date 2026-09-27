import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getAnalysis } from './analysis-service'
import { ServiceError } from './errors'
import type { Analysis } from '@/lib/domain/schemas'

export type LoadResult = { ok: true; analysis: Analysis } | { ok: false; message: string; kind: ServiceError['kind'] }

/** Request-scoped loader shared by the analysis layout and its pages. */
export const loadAnalysis = cache(async (id: string): Promise<LoadResult> => {
  try {
    return { ok: true, analysis: await getAnalysis(id) }
  } catch (error) {
    if (error instanceof ServiceError) {
      if (error.kind === 'not_found') notFound()
      return { ok: false, message: error.userMessage, kind: error.kind }
    }
    throw error
  }
})

/**
 * For result pages (chains, findings, report). The layout already renders the
 * service error, so a failure here renders nothing; an unfinished analysis
 * redirects to the overview, which shows progress.
 */
export async function loadCompleteAnalysis(id: string): Promise<Analysis | null> {
  const result = await loadAnalysis(id)
  if (!result.ok) return null
  if (result.analysis.status !== 'complete') redirect(`/analyses/${id}`)
  return result.analysis
}
