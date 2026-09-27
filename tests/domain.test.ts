/**
 * Domain query / utility function tests.
 *
 * Covers summarizeFindings, severityCounts, bySeverity, evidenceSupport,
 * chainFiles, and formatLocation.
 */

import { describe, it, expect } from 'vitest'
import {
  bySeverity,
  chainFiles,
  evidenceSupport,
  indexEvidence,
  severityCounts,
  summarizeFindings,
} from '@/lib/domain/queries'
import { formatLocation, formatConfidence } from '@/lib/domain/labels'
import type { AttackChain, Evidence, Finding } from '@/lib/domain/schemas'

// ---------------------------------------------------------------------------
// Helpers for building minimal fixtures
// ---------------------------------------------------------------------------
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-001',
    category: 'reentrancy',
    title: 'Test finding',
    severity: 'high',
    status: 'detected',
    relationship: 'isolated',
    description: 'Test.',
    contract: 'Vault',
    function: 'withdraw',
    sourceLocation: { file: 'contracts/Vault.sol', lineStart: 10, lineEnd: 15 },
    detector: 'slither:reentrancy-eth',
    evidenceReferences: [],
    relatedFindings: [],
    chainIds: [],
    confidence: 0.85,
    ...overrides,
  }
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'EV-001',
    type: 'static_detector',
    sourceFile: 'contracts/Vault.sol',
    contract: 'Vault',
    function: 'withdraw',
    lineStart: 10,
    lineEnd: 10,
    description: 'Reentrancy.',
    source: 'slither',
    verificationStatus: 'verified',
    ...overrides,
  }
}

function makeStep() {
  return {
    id: 'AC-001-S1',
    order: 1,
    type: 'attacker_action' as const,
    title: 'Step 1',
    contract: 'Vault',
    function: 'withdraw',
    sourceLocation: { file: 'contracts/Vault.sol', lineStart: 10, lineEnd: 15 },
    description: '',
    reason: '',
    dependencies: [],
    evidence: ['EV-001'],
    findingIds: [],
    assumptions: [],
    confidence: 0.8,
  }
}

function makeChain(overrides: Partial<AttackChain> = {}): AttackChain {
  return {
    id: 'AC-001',
    title: 'Potential reentrancy drain',
    summary: 'Drain via reentrancy.',
    severity: 'high',
    confidence: 0.77,
    supportLevel: 'moderate',
    status: 'supported',
    entryPoint: { contract: 'Vault', function: 'withdraw', sourceLocation: null },
    preconditions: [],
    steps: [makeStep()],
    evidence: ['EV-001'],
    impact: { summary: 'ETH can be drained.', assetsAtRisk: ['ETH held by Vault'] },
    relatedFindingIds: ['F-001'],
    contractsInvolved: ['Vault'],
    breakPoints: [{
      id: 'AC-001-BP1',
      title: 'Apply CEI',
      location: { file: 'contracts/Vault.sol', lineStart: 10, lineEnd: 15, contract: 'Vault', function: 'withdraw' },
      recommendation: 'Update state before transfer.',
      rationale: 'Breaks reentrancy loop.',
      affectedStepIds: ['AC-001-S1'],
      confidence: 0.9,
    }],
    confidenceChecks: [],
    assumptions: [],
    limitations: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// summarizeFindings
// ---------------------------------------------------------------------------
describe('summarizeFindings', () => {
  it('returns zeros for empty list', () => {
    expect(summarizeFindings([])).toEqual({ total: 0, inChains: 0, related: 0, isolated: 0, unverified: 0 })
  })

  it('counts each relationship correctly', () => {
    const findings = [
      makeFinding({ relationship: 'chain' }),
      makeFinding({ id: 'F-002', relationship: 'chain' }),
      makeFinding({ id: 'F-003', relationship: 'related' }),
      makeFinding({ id: 'F-004', relationship: 'isolated' }),
      makeFinding({ id: 'F-005', relationship: 'unverified' }),
    ]
    expect(summarizeFindings(findings)).toEqual({ total: 5, inChains: 2, related: 1, isolated: 1, unverified: 1 })
  })
})

// ---------------------------------------------------------------------------
// severityCounts
// ---------------------------------------------------------------------------
describe('severityCounts', () => {
  it('counts severities', () => {
    const items = [
      { severity: 'critical' as const },
      { severity: 'high' as const },
      { severity: 'high' as const },
      { severity: 'medium' as const },
    ]
    const counts = severityCounts(items)
    expect(counts.critical).toBe(1)
    expect(counts.high).toBe(2)
    expect(counts.medium).toBe(1)
    expect(counts.low).toBe(0)
    expect(counts.informational).toBe(0)
  })

  it('returns zeros for empty list', () => {
    const counts = severityCounts([])
    expect(counts.critical).toBe(0)
    expect(counts.high).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// bySeverity
// ---------------------------------------------------------------------------
describe('bySeverity', () => {
  it('sorts critical before high before medium', () => {
    const items = [
      makeFinding({ id: 'F-3', severity: 'medium' }),
      makeFinding({ id: 'F-1', severity: 'critical' }),
      makeFinding({ id: 'F-2', severity: 'high' }),
    ]
    const sorted = [...items].sort(bySeverity)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('high')
    expect(sorted[2].severity).toBe('medium')
  })

  it('is stable for equal severity', () => {
    const items = [
      makeFinding({ id: 'F-1', severity: 'high' }),
      makeFinding({ id: 'F-2', severity: 'high' }),
    ]
    const sorted = [...items].sort(bySeverity)
    expect(sorted.map((f) => f.id)).toEqual(['F-1', 'F-2'])
  })
})

// ---------------------------------------------------------------------------
// evidenceSupport
// ---------------------------------------------------------------------------
describe('evidenceSupport', () => {
  it('returns correct verified/total counts', () => {
    const ev1 = makeEvidence({ id: 'EV-001', verificationStatus: 'verified' })
    const ev2 = makeEvidence({ id: 'EV-002', verificationStatus: 'partial' })
    const ev3 = makeEvidence({ id: 'EV-003', verificationStatus: 'unverified' })
    const chain = makeChain({ evidence: ['EV-001', 'EV-002', 'EV-003'] })
    const index = indexEvidence([ev1, ev2, ev3])
    expect(evidenceSupport(chain, index)).toEqual({ verified: 1, total: 3 })
  })

  it('handles missing evidence ids gracefully', () => {
    const chain = makeChain({ evidence: ['EV-MISSING'] })
    const index = indexEvidence([])
    expect(evidenceSupport(chain, index)).toEqual({ verified: 0, total: 0 })
  })
})

// ---------------------------------------------------------------------------
// chainFiles
// ---------------------------------------------------------------------------
describe('chainFiles', () => {
  it('collects unique files from entry point, steps, and break points', () => {
    const chain = makeChain()
    const files = chainFiles(chain)
    expect(files).toContain('contracts/Vault.sol')
    // All three locations point to the same file, result should be deduplicated
    expect(files.length).toBe(1)
  })

  it('includes entry point source location when present', () => {
    const chain = makeChain({
      entryPoint: {
        contract: 'LendingVault',
        function: 'borrow',
        sourceLocation: { file: 'contracts/LendingVault.sol', lineStart: 30, lineEnd: 40 },
      },
    })
    const files = chainFiles(chain)
    expect(files).toContain('contracts/LendingVault.sol')
  })
})

// ---------------------------------------------------------------------------
// formatLocation and formatConfidence labels
// ---------------------------------------------------------------------------
describe('formatLocation', () => {
  it('formats a single-line location', () => {
    expect(formatLocation({ file: 'contracts/Vault.sol', lineStart: 10, lineEnd: 10 })).toBe('contracts/Vault.sol:L10')
  })

  it('formats a range location', () => {
    expect(formatLocation({ file: 'contracts/Vault.sol', lineStart: 10, lineEnd: 20 })).toBe('contracts/Vault.sol:L10–L20')
  })

  it('returns "Location unavailable" for null', () => {
    expect(formatLocation(null)).toBe('Location unavailable')
  })
})

describe('formatConfidence', () => {
  it('rounds to nearest integer percent', () => {
    expect(formatConfidence(0.77)).toBe('77%')
    expect(formatConfidence(0.0)).toBe('0%')
    expect(formatConfidence(1.0)).toBe('100%')
    expect(formatConfidence(0.333)).toBe('33%')
  })
})
