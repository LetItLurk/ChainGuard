'use client'

import { useEffect, useMemo, useRef } from 'react'
import { FileCode2 } from 'lucide-react'
import { tokenizeSolidity, type TokenKind } from '@/lib/code/solidity-tokens'
import { cn } from '@/lib/utils'

const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: 'text-code-keyword',
  type: 'text-code-type',
  string: 'text-code-string',
  number: 'text-code-number',
  comment: 'text-code-comment italic',
  plain: '',
}

type CodeViewerProps = {
  path: string
  content: string | null
  highlight: { lineStart: number; lineEnd: number } | null
  className?: string
}

export function CodeViewer({ path, content, highlight, className }: CodeViewerProps) {
  const lines = useMemo(() => (content ? tokenizeSolidity(content) : []), [content])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!highlight || !containerRef.current) return
    const row = containerRef.current.querySelector<HTMLElement>(`[data-line="${highlight.lineStart}"]`)
    if (!row) return
    const container = containerRef.current
    container.scrollTo({ top: Math.max(0, row.offsetTop - container.clientHeight / 3), behavior: 'smooth' })
  }, [highlight, path])

  const rangeLabel = highlight
    ? highlight.lineStart === highlight.lineEnd
      ? `line ${highlight.lineStart}`
      : `lines ${highlight.lineStart}–${highlight.lineEnd}`
    : null

  return (
    <section aria-label={`Source: ${path}`} className={cn('flex min-h-0 flex-col overflow-hidden rounded-md border bg-card', className)}>
      <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs">{path}</span>
        </div>
        {rangeLabel && <span className="shrink-0 font-mono text-xs text-primary">{rangeLabel}</span>}
      </header>
      {content === null ? (
        <p className="p-4 text-sm text-muted-foreground">Source for this file is unavailable.</p>
      ) : (
        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
          <pre className="py-2 font-mono text-[12.5px] leading-5">
            <code>
              {lines.map((tokens, index) => {
                const lineNumber = index + 1
                const active = highlight && lineNumber >= highlight.lineStart && lineNumber <= highlight.lineEnd
                return (
                  <div
                    key={lineNumber}
                    data-line={lineNumber}
                    className={cn('flex pr-4', active && 'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]')}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'w-12 shrink-0 select-none pr-3 text-right tabular-nums',
                        active ? 'text-primary' : 'text-muted-foreground/60',
                      )}
                    >
                      {lineNumber}
                    </span>
                    <span className="whitespace-pre">
                      {tokens.length === 0
                        ? ' '
                        : tokens.map((t, i) => (
                            <span key={i} className={TOKEN_CLASS[t.kind]}>
                              {t.text}
                            </span>
                          ))}
                    </span>
                  </div>
                )
              })}
            </code>
          </pre>
        </div>
      )}
    </section>
  )
}
