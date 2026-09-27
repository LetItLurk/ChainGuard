import { NextResponse } from 'next/server'
import { getAnalysis } from '@/lib/api/analysis-service'
import { ServiceError } from '@/lib/api/errors'
import { analysisToMarkdown } from '@/lib/reporting/markdown'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const format = new URL(request.url).searchParams.get('format') === 'md' ? 'md' : 'json'
  try {
    const analysis = await getAnalysis(id)
    if (analysis.status !== 'complete') {
      return NextResponse.json({ detail: 'The analysis has not completed yet.' }, { status: 409 })
    }
    const base = `chainguard-${analysis.id}`
    if (format === 'md') {
      return new NextResponse(analysisToMarkdown(analysis), {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${base}.md"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    return new NextResponse(JSON.stringify(analysis, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${base}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ detail: error.userMessage }, { status: error.status })
    }
    return NextResponse.json({ detail: 'Unable to export the report.' }, { status: 500 })
  }
}
