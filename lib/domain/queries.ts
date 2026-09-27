import { SEVERITY_ORDER } from './labels'
import type { Analysis, AttackChain, Evidence, Finding, Severity } from './schemas'

export function indexEvidence(evidence: Evidence[]): Map<string, Evidence> {
  return new Map(evidence.map((e) => [e.id, e]))
}

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity)
}

export function bySeverity<T extends { severity: Severity }>(a: T, b: T): number {
  return severityRank(a.severity) - severityRank(b.severity)
}

export function summarizeFindings(findings: Finding[]) {
  return {
    total: findings.length,
    inChains: findings.filter((f) => f.relationship === 'chain').length,
    related: findings.filter((f) => f.relationship === 'related').length,
    isolated: findings.filter((f) => f.relationship === 'isolated').length,
    unverified: findings.filter((f) => f.relationship === 'unverified').length,
  }
}

export function severityCounts(items: { severity: Severity }[]): Record<Severity, number> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 }
  for (const item of items) counts[item.severity] += 1
  return counts
}

/** Share of a chain's evidence items that passed validation. */
export function evidenceSupport(chain: AttackChain, evidenceIndex: Map<string, Evidence>) {
  const items = chain.evidence.map((id) => evidenceIndex.get(id)).filter((e): e is Evidence => Boolean(e))
  const verified = items.filter((e) => e.verificationStatus === 'verified').length
  return { verified, total: items.length }
}

export function chainFiles(chain: AttackChain): string[] {
  const files = new Set<string>()
  if (chain.entryPoint.sourceLocation) files.add(chain.entryPoint.sourceLocation.file)
  for (const step of chain.steps) if (step.sourceLocation) files.add(step.sourceLocation.file)
  for (const bp of chain.breakPoints) files.add(bp.location.file)
  return [...files]
}

export function findChain(analysis: Analysis, chainId: string): AttackChain | undefined {
  return analysis.attackChains.find((c) => c.id === chainId)
}
