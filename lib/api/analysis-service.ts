import 'server-only'
import { z } from 'zod'
import { DEMO_ANALYSIS, DEMO_ANALYSIS_ID, DEMO_SOURCES } from '@/fixtures/demo/demo-analysis'
import {
  AnalysisSchema,
  AnalysisStatusPayloadSchema,
  SourceFileSchema,
  type Analysis,
  type AnalysisStatusPayload,
  type SourceFile,
} from '@/lib/domain/schemas'
import { getServerConfig } from '@/lib/config'
import { backendRequest } from './backend-client'
import { ServiceError } from './errors'
import { getLocalAnalysis, getLocalSources, isLocalAnalysis } from './local-analyzer'

const ANALYSIS_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function assertAnalysisId(id: string): void {
  if (!ANALYSIS_ID_PATTERN.test(id)) throw new ServiceError('not_found')
}

export function isDemoAnalysis(id: string): boolean {
  return id === DEMO_ANALYSIS_ID
}

export function isBackendConfigured(): boolean {
  return getServerConfig().apiUrl !== null
}

export async function getAnalysis(id: string): Promise<Analysis> {
  if (isDemoAnalysis(id)) return DEMO_ANALYSIS
  if (isLocalAnalysis(id)) return AnalysisSchema.parse(getLocalAnalysis(id))
  assertAnalysisId(id)
  return backendRequest(`/analysis/${id}`, AnalysisSchema)
}

export async function getAnalysisStatus(id: string): Promise<AnalysisStatusPayload> {
  if (isDemoAnalysis(id)) {
    return { id, status: DEMO_ANALYSIS.status, stages: DEMO_ANALYSIS.stages, error: null }
  }
  if (isLocalAnalysis(id)) {
    const analysis = getLocalAnalysis(id)
    return { id, status: analysis?.status ?? 'failed', stages: analysis?.stages ?? [], error: null }
  }
  assertAnalysisId(id)
  return backendRequest(`/analysis/${id}/status`, AnalysisStatusPayloadSchema)
}

export async function getSourceFiles(id: string, paths: string[]): Promise<SourceFile[]> {
  const unique = [...new Set(paths)]
  if (isDemoAnalysis(id)) return DEMO_SOURCES.filter((s) => unique.includes(s.path))
  if (isLocalAnalysis(id)) return getLocalSources(id, unique)
  assertAnalysisId(id)
  const query = new URLSearchParams(unique.map((p) => ['path', p]))
  return backendRequest(`/analysis/${id}/sources?${query}`, z.array(SourceFileSchema))
}

const StartResponseSchema = z.object({ id: z.string().regex(ANALYSIS_ID_PATTERN) })

export type StartAnalysisInput = { kind: 'github'; url: string } | { kind: 'zip'; file: File }

export async function startAnalysis(input: StartAnalysisInput): Promise<{ id: string }> {
  if (input.kind === 'github') {
    return backendRequest('/analyze', StartResponseSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_type: 'github', github_url: input.url }),
    })
  }
  const form = new FormData()
  form.set('file', input.file, input.file.name)
  return backendRequest('/analyze/upload', StartResponseSchema, { method: 'POST', body: form })
}
