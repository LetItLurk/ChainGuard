import 'server-only'
import { z } from 'zod'

const ServerEnvSchema = z.object({
  CHAINGUARD_API_URL: z.url().optional(),
  CHAINGUARD_INTERNAL_TOKEN: z.string().min(24).optional(),
  CHAINGUARD_AI_MODEL: z.string().default('anthropic/claude-sonnet-5'),
  CHAINGUARD_MAX_UPLOAD_MB: z.coerce.number().positive().max(100).default(20),
})

export type ServerConfig = {
  apiUrl: string | null
  internalToken: string | null
  aiModel: string
  maxUploadBytes: number
}

let cached: ServerConfig | null = null

export function getServerConfig(): ServerConfig {
  if (cached) return cached
  const parsed = ServerEnvSchema.safeParse({
    CHAINGUARD_API_URL: process.env.CHAINGUARD_API_URL || undefined,
    CHAINGUARD_INTERNAL_TOKEN: process.env.CHAINGUARD_INTERNAL_TOKEN || undefined,
    CHAINGUARD_AI_MODEL: process.env.CHAINGUARD_AI_MODEL || undefined,
    CHAINGUARD_MAX_UPLOAD_MB: process.env.CHAINGUARD_MAX_UPLOAD_MB || undefined,
  })
  if (!parsed.success) {
    throw new Error(`Invalid ChainGuard server configuration: ${parsed.error.issues.map(i => i.message).join(', ')}`)
  }
  const env = parsed.data
  cached = {
    apiUrl: env.CHAINGUARD_API_URL ? env.CHAINGUARD_API_URL.replace(/\/$/, '') : null,
    internalToken: env.CHAINGUARD_INTERNAL_TOKEN ?? null,
    aiModel: env.CHAINGUARD_AI_MODEL,
    maxUploadBytes: env.CHAINGUARD_MAX_UPLOAD_MB * 1024 * 1024,
  }
  return cached
}
