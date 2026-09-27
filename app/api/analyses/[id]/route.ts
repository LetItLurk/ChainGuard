import { NextResponse } from 'next/server'
import { getAnalysis } from '@/lib/api/analysis-service'
import { ServiceError } from '@/lib/api/errors'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const analysis = await getAnalysis(id)
    return NextResponse.json(analysis, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ detail: error.userMessage, kind: error.kind }, { status: error.status })
    }
    return NextResponse.json({ detail: 'Unable to load analysis.' }, { status: 500 })
  }
}
