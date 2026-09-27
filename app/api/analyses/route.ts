import { NextResponse } from 'next/server'
import { isBackendConfigured, startAnalysis } from '@/lib/api/analysis-service'
import { DEMO_ANALYSIS_ID } from '@/fixtures/demo/demo-analysis'
import { ServiceError } from '@/lib/api/errors'
import { getServerConfig } from '@/lib/config'
import { GithubUrlSchema, validateZipFile } from '@/lib/validation/repository-input'
import { analyzeGithubLocally, localAnalysisErrorMessage } from '@/lib/api/local-analyzer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { maxUploadBytes } = getServerConfig()
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ detail: 'Invalid submission.' }, { status: 400 })

  try {
    const sourceType = form.get('sourceType')
    if (sourceType === 'github') {
      const url = GithubUrlSchema.safeParse(form.get('githubUrl'))
      if (!url.success) return NextResponse.json({ detail: url.error.issues[0]?.message }, { status: 400 })
      if (!isBackendConfigured()) {
        try {
          return NextResponse.json({ ...(await analyzeGithubLocally(url.data)), mode: 'local' }, { status: 202 })
        } catch (error) {
          return NextResponse.json({ detail: localAnalysisErrorMessage(error) }, { status: 422 })
        }
      }
      return NextResponse.json(await startAnalysis({ kind: 'github', url: url.data }), { status: 202 })
    }
    if (sourceType === 'zip') {
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ detail: 'Attach a .zip archive.' }, { status: 400 })
      const problem = validateZipFile(file, maxUploadBytes)
      if (problem) return NextResponse.json({ detail: problem }, { status: 400 })
      if (!isBackendConfigured()) {
        return NextResponse.json({ detail: 'ZIP analysis without the backend is not available yet. Use a public GitHub URL or start the backend.' }, { status: 422 })
      }
      return NextResponse.json(await startAnalysis({ kind: 'zip', file }), { status: 202 })
    }
    return NextResponse.json({ detail: 'Choose a repository source.' }, { status: 400 })
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ detail: error.userMessage, kind: error.kind }, { status: error.status })
    }
    console.error('[chainguard] Unexpected error starting analysis', error)
    return NextResponse.json({ detail: 'Unable to start the analysis.' }, { status: 500 })
  }
}
