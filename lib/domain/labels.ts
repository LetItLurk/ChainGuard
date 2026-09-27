import type {
  AnalysisStageName,
  AttackStepType,
  EvidenceType,
  FindingCategory,
  RelationshipStatus,
  Severity,
  SupportLevel,
  SupportStatus,
  VerificationStatus,
} from './schemas'

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'informational']

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
}

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  reentrancy: 'Reentrancy',
  access_control: 'Access control',
  oracle_manipulation: 'Oracle / price manipulation',
  flash_loan_surface: 'Flash-loan surface',
  unchecked_external_call: 'Unchecked external call',
  logic_arithmetic: 'Logic / arithmetic',
  other: 'Other',
}

export const SUPPORT_LABEL: Record<SupportStatus, string> = {
  detected: 'Detected',
  supported: 'Supported',
  potential: 'Potential',
  unverified: 'Unverified',
}

export const SUPPORT_DESCRIPTION: Record<SupportStatus, string> = {
  detected: 'Reported by a deterministic static-analysis detector.',
  supported: 'Validated against source code and at least one static relationship.',
  potential: 'Plausible from the available evidence, but only partially supported.',
  unverified: 'Could not be validated against the repository. Requires manual review.',
}

export const RELATIONSHIP_LABEL: Record<RelationshipStatus, string> = {
  chain: 'Part of attack chain',
  related: 'Related',
  isolated: 'Isolated',
  unverified: 'Unverified',
}

export const SUPPORT_LEVEL_LABEL: Record<SupportLevel, string> = {
  strong: 'Strongly supported',
  moderate: 'Moderately supported',
  weak: 'Weakly supported',
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  verified: 'Verified',
  partial: 'Partial',
  unverified: 'Unverified',
  failed: 'Failed validation',
}

export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  source: 'Source code',
  function: 'Function',
  call_dependency: 'Call dependency',
  state_dependency: 'State dependency',
  static_detector: 'Static detector',
  external_dependency: 'External dependency',
  access_control: 'Access control',
  ai_reasoning: 'AI reasoning',
}

export const STEP_TYPE_LABEL: Record<AttackStepType, string> = {
  attacker_action: 'Attacker action',
  contract_function: 'Contract function',
  state_change: 'State change',
  external_dependency: 'External dependency',
  vulnerability: 'Vulnerability',
  impact: 'Impact',
}

export const STAGE_LABEL: Record<AnalysisStageName, string> = {
  ingestion: 'Repository ingestion',
  mapping: 'Repository mapping',
  static_analysis: 'Static analysis',
  dependency_mapping: 'Dependency mapping',
  ai_investigation: 'AI investigation',
  evidence_validation: 'Evidence validation',
  chain_construction: 'Attack-chain construction',
  report_preparation: 'Report preparation',
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatLocation(loc: { file: string; lineStart: number; lineEnd: number } | null): string {
  if (!loc) return 'Location unavailable'
  const range = loc.lineStart === loc.lineEnd ? `L${loc.lineStart}` : `L${loc.lineStart}–${loc.lineEnd}`
  return `${loc.file}:${range}`
}
