'use client'

import { FileJson, FileText, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ReportActions({ analysisId }: { analysisId: string }) {
  const base = `/api/analyses/${analysisId}/report`
  return (
    <div className="print-hidden flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden /> Print / PDF
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`${base}?format=md`} download>
          <FileText aria-hidden /> Markdown
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`${base}?format=json`} download>
          <FileJson aria-hidden /> JSON
        </a>
      </Button>
    </div>
  )
}
