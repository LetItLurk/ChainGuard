/**
 * Markdown report generation tests.
 *
 * Verifies that analysisToMarkdown produces structurally correct output for
 * complete analyses, empty findings, and fixture (demo) mode.
 */

import { describe, it, expect } from 'vitest'
import { analysisToMarkdown } from '@/lib/reporting/markdown'
import { DEMO_ANALYSIS } from '@/fixtures/demo/demo-analysis'
import type { Analysis } from '@/lib/domain/schemas'

// ---------------------------------------------------------------------------
// Minimal analysis factory
// ---------------------------------------------------------------------------
function makeMinimalAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    ...DEMO_ANALYSIS,
    id: 'test-001',
    mode: 'live',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('analysisToMarkdown', () => {
  it('includes the repository name as H1', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md).toContain('# ChainGuard Report —')
  })

  it('includes the analysis ID', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis({ id: 'unique-id-xyz' }))
    expect(md).toContain('unique-id-xyz')
  })

  it('labels fixture analysis clearly', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis({ mode: 'fixture' }))
    expect(md).toContain('Demo Analysis')
  })

  it('does NOT label live analysis as demo', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis({ mode: 'live' }))
    expect(md).not.toContain('Demo Analysis')
  })

  it('includes executive summary section', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md).toContain('## Executive summary')
  })

  it('includes attack chains section', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md).toContain('## Attack chains')
  })

  it('includes findings section', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md).toContain('## Findings')
  })

  it('includes methodology & limitations section', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md).toContain('## Methodology & limitations')
  })

  it('mentions chain count in executive summary', () => {
    const analysis = makeMinimalAnalysis()
    const md = analysisToMarkdown(analysis)
    expect(md).toContain(`${analysis.attackChains.length} potential attack chain`)
  })

  it('handles analysis with zero findings gracefully', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis({ findings: [], attackChains: [] }))
    expect(md).toContain('No connected attack chains')
    expect(md).not.toThrow
  })

  it('uses precise security language — no "guaranteed exploit"', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md.toLowerCase()).not.toContain('guaranteed exploit')
    expect(md.toLowerCase()).not.toContain('definitely exploitable')
    expect(md.toLowerCase()).not.toContain('100% secure')
  })

  it('preserves pipe characters safely in table cells', () => {
    const analysis = makeMinimalAnalysis({
      findings: [
        {
          ...DEMO_ANALYSIS.findings[0],
          title: 'Finding with | pipe character',
        },
      ],
    })
    const md = analysisToMarkdown(analysis)
    // Pipes inside table cells must be escaped
    expect(md).not.toMatch(/\| Finding with \| pipe character \|/)
  })

  it('includes all attack chain IDs', () => {
    const analysis = makeMinimalAnalysis()
    const md = analysisToMarkdown(analysis)
    for (const chain of analysis.attackChains) {
      expect(md).toContain(chain.id)
    }
  })

  it('includes break point recommendations', () => {
    const analysis = makeMinimalAnalysis()
    const md = analysisToMarkdown(analysis)
    const allBps = analysis.attackChains.flatMap((c) => c.breakPoints)
    if (allBps.length > 0) {
      expect(md).toContain(allBps[0].recommendation.slice(0, 20))
    }
  })

  it('returns a non-empty string', () => {
    const md = analysisToMarkdown(makeMinimalAnalysis())
    expect(md.length).toBeGreaterThan(100)
  })
})
