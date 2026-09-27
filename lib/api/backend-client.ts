import 'server-only'
import type { z } from 'zod'
import { getServerConfig } from '@/lib/config'
import { ServiceError } from './errors'

const REQUEST_TIMEOUT_MS = 15_000

/** Typed, validated fetch against the ChainGuard FastAPI backend. Server-only. */
export async function backendRequest<T extends z.ZodType>(
  path: string,
  schema: T,
  init: RequestInit = {},
): Promise<z.infer<T>> {
  const { apiUrl, internalToken } = getServerConfig()
  if (!apiUrl) throw new ServiceError('not_configured')

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (internalToken) headers.set('Authorization', `Bearer ${internalToken}`)

  let response: Response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers,
    })
  } catch {
    throw new ServiceError('unreachable')
  }

  if (response.status === 404) throw new ServiceError('not_found')
  if (response.status === 400 || response.status === 413 || response.status === 422) {
    const detail = await readDetail(response)
    throw new ServiceError('invalid_request', detail, response.status)
  }
  if (!response.ok) throw new ServiceError('upstream', `Backend responded ${response.status}`)

  const json: unknown = await response.json().catch(() => null)
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    console.error('[chainguard] Backend response failed schema validation', path, parsed.error.issues.slice(0, 5))
    throw new ServiceError('invalid_response')
  }
  return parsed.data
}

async function readDetail(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null
  return typeof body?.detail === 'string' ? body.detail : undefined
}
