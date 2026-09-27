import {
  CATEGORY_LABEL,
  RELATIONSHIP_LABEL,
  SEVERITY_LABEL,
  STEP_TYPE_LABEL,
  SUPPORT_LABEL,
  SUPPORT_LEVEL_LABEL,
  formatConfidence,
  formatLocation,
} from '@/lib/domain/labels'
import { bySeverity, summarizeFindings } from '@/lib/domain/queries'
import type { Analysis } from '@/lib/domain/schemas'

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

export function analysisToMarkdown(analysis: Analysis): string {
  const { repository } = analysis
  const summary = summarizeFindings(analysis.findings)
  const lines: string[] = []
  const push = (...l: string[]) => lines.push(...l)

  push(`# ChainGuard Report — ${repository.name}`, '')
  if (analysis.mode === 'fixture') push('> **Demo Analysis.** Pre-recorded fixture data; not produced by a live run.', '')
  push(
    `- Source: \`${repository.sourceReference}\``,
    `- Analysis ID: \`${analysis.id}\``,
    `- Completed: ${analysis.completedAt ?? 'n/a'}`,
    `- Static analysis: ${analysis.staticAnalysis.tool} (${analysis.staticAnalysis.status})`,
    `- AI investigation: ${analysis.aiStatus}`,
    '',
    '## Executive summary',
    '',
    `ChainGuard identified **${analysis.attackChains.length} potential attack chain(s)** and **${summary.total} potential finding(s)** ` +
      `(${summary.inChains} in chains, ${summary.isolated} isolated, ${summary.unverified} unverified) across ` +
      `${repository.contractsCount} contracts and ${repository.functionsCount} functions.`,
    '',
    'Results are potential issues derived from static analysis and evidence-validated AI reasoning. They are not confirmed exploits and require manual verification.',
    '',
    '## Attack chains',
    '',
  )

  if (analysis.attackChains.length === 0) push('No connected attack chains were established from the available evidence.', '')

  for (const chain of [...analysis.attackChains].sort(bySeverity)) {
    push(
      `### ${chain.id} — ${chain.title}`,
      '',
      `**Severity:** ${SEVERITY_LABEL[chain.severity]} · **Status:** ${SUPPORT_LABEL[chain.status]} · **Support:** ${SUPPORT_LEVEL_LABEL[chain.supportLevel]} · **Confidence:** ${formatConfidence(chain.confidence)}`,
      '',
      chain.summary,
      '',
      `**Entry point:** \`${chain.entryPoint.contract}.${chain.entryPoint.function}()\` (${formatLocation(chain.entryPoint.sourceLocation)})`,
      '',
      '**Preconditions**',
      '',
      ...chain.preconditions.map((p) => `- ${p}`),
      '',
      '**Steps**',
      '',
      '| # | Type | Step | Location | Evidence | Confidence |',
      '|---|------|------|----------|----------|------------|',
      ...chain.steps.map(
        (s) =>
          `| ${s.order} | ${STEP_TYPE_LABEL[s.type]} | ${esc(s.title)} | \`${formatLocation(s.sourceLocation)}\` | ${s.evidence.join(', ')} | ${formatConfidence(s.confidence)} |`,
      ),
      '',
      `**Impact:** ${chain.impact.summary}`,
      '',
      '**How to break the chain**',
      '',
      ...chain.breakPoints.map(
        (bp, i) => `${i + 1}. **${bp.title}** — \`${formatLocation(bp.location)}\`. ${bp.recommendation} _${bp.rationale}_`,
      ),
      '',
    )
    if (chain.assumptions.length || chain.limitations.length) {
      push('**Assumptions & limitations**', '', ...[...chain.assumptions, ...chain.limitations].map((a) => `- ${a}`), '')
    }
  }

  push(
    '## Findings',
    '',
    '| ID | Severity | Category | Title | Location | Relationship | Status |',
    '|----|----------|----------|-------|----------|--------------|--------|',
    ...[...analysis.findings]
      .sort(bySeverity)
      .map(
        (f) =>
          `| ${f.id} | ${SEVERITY_LABEL[f.severity]} | ${CATEGORY_LABEL[f.category]} | ${esc(f.title)} | \`${formatLocation(f.sourceLocation)}\` | ${RELATIONSHIP_LABEL[f.relationship]} | ${SUPPORT_LABEL[f.status]} |`,
      ),
    '',
    '## Evidence appendix',
    '',
    ...analysis.evidence.map(
      (e) =>
        `- **${e.id}** (${e.type}, ${e.source}, ${e.verificationStatus}) — ${e.description}${e.sourceFile ? ` \`${e.sourceFile}:L${e.lineStart}${e.lineEnd && e.lineEnd !== e.lineStart ? `–${e.lineEnd}` : ''}\`` : ''}`,
    ),
    '',
    '## Methodology & limitations',
    '',
    '1. Repository ingestion with path-traversal, size, and file-type guards. Repository code is never executed.',
    '2. Deterministic repository mapping of contracts, functions, external calls, state reads/writes, and oracle dependencies.',
    '3. Static analysis with Slither where available.',
    '4. AI investigation over a bounded context package; outputs are candidates only.',
    '5. Evidence validation of every contract, function, file, and line reference against the repository map.',
    '',
    ...analysis.limitations.map((l) => `- ${l}`),
    '',
  )

  return lines.join('\n')
}
