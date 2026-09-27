import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { InvestigationContextSchema, runInvestigation } from '@/lib/ai/investigation'
import { getServerConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_BODY_BYTES = 2 * 1024 * 1024

/**
 * Server-to-server endpoint called by the FastAPI backend during the
 * `ai_investigation` stage. Authenticated with CHAINGUARD_INTERNAL_TOKEN.
 * Returns unvalidated candidates; the backend performs evidence validation.
 */
export async function POST(request: Request) {
  const { internalToken } = getServerConfig()
  if (!internalToken) {
    return NextResponse.json({ detail: 'AI investigation is not configured.' }, { status: 503 })
  }
  if (!isAuthorized(request.headers.get('authorization'), internalToken)) {
    return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
  }

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: 'Context package too large.' }, { status: 413 })
  }

  const parsed = InvestigationContextSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ detail: 'Invalid investigation context.' }, { status: 422 })
  }

  try {
    const candidates = await runInvestigation(parsed.data)
    return NextResponse.json(candidates)
  } catch (error) {
    console.error('[chainguard] AI investigation failed', parsed.data.analysisId, error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ detail: 'AI investigation failed.' }, { status: 502 })
  }
}

function isAuthorized(header: string | null, token: string): boolean {
  if (!header?.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(token)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}
