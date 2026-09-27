import type { SourceFile, SourceLocation } from '@/lib/domain/schemas'

/**
 * Resolves fixture source locations from anchor strings so the demo never
 * carries hand-typed line numbers. Throws if an anchor is missing, which
 * surfaces fixture drift at module load and in tests.
 */
export function createLocator(sources: SourceFile[]) {
  const linesByPath = new Map(sources.map((s) => [s.path, s.content.split('\n')]))

  function getLines(file: string): string[] {
    const lines = linesByPath.get(file)
    if (!lines) throw new Error(`Fixture source not found: ${file}`)
    return lines
  }

  function lineOf(file: string, anchor: string, after = 0): number {
    const lines = getLines(file)
    const index = lines.findIndex((line, i) => i >= after && line.includes(anchor))
    if (index === -1) throw new Error(`Anchor "${anchor}" not found in ${file}`)
    return index + 1
  }

  function line(file: string, anchor: string, withinBlock?: string): SourceLocation {
    const after = withinBlock ? lineOf(file, withinBlock) - 1 : 0
    const n = lineOf(file, anchor, after)
    return { file, lineStart: n, lineEnd: n }
  }

  /** Range from the line containing `anchor` to its matching closing brace (or `;` for declarations). */
  function block(file: string, anchor: string): SourceLocation {
    const lines = getLines(file)
    const start = lineOf(file, anchor)
    let depth = 0
    let opened = false
    for (let i = start - 1; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          depth++
          opened = true
        } else if (ch === '}') {
          depth--
        } else if (ch === ';' && !opened) {
          return { file, lineStart: start, lineEnd: i + 1 }
        }
      }
      if (opened && depth === 0) return { file, lineStart: start, lineEnd: i + 1 }
    }
    throw new Error(`Unterminated block for "${anchor}" in ${file}`)
  }

  return { line, block }
}
