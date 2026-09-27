/**
 * Schema validation tests.
 *
 * Verifies that every canonical domain schema correctly accepts valid payloads
 * and rejects invalid/malformed ones. This guards against schema drift between
 * the frontend (lib/domain/schemas.ts) and the backend (models/domain.py).
 */

import { describe, it, expect } from 'vitest'
import {
  AnalysisSchema,
  AnalysisStatusPayloadSchema,
  AttackChainSchema,
  AttackStepSchema,
  BreakPointSchema,
  EvidenceSchema,
  FindingSchema,
  RepositoryMapSchema,
  RepositorySchema,
  SourceFileSchema,
  SourceLocationSchema,
} from '@/lib/domain/schemas'

// ---------------------------------------------------------------------------
// SourceLocation
// ---------------------------------------------------------------------------
describe('SourceLocationSchema', () => {
  it('accepts a valid location', () => {
    const result = SourceLocationSchema.safeParse({ file: 'contracts/Vault.sol', lineStart: 1, lineEnd: 20 })
    expect(result.success).toBe(true)
  })

  it('rejects an empty file path', () => {
    const result = SourceLocationSchema.safeParse({ file: '', lineStart: 1, lineEnd: 1 })
    expect(result.success).toBe(false)
  })

  it('rejects non-positive line numbers', () => {
    const result = SourceLocationSchema.safeParse({ file: 'a.sol', lineStart: 0, lineEnd: 1 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
describe('EvidenceSchema', () => {
  const base = {
    id: 'EV-abc12345',
    type: 'static_detector',
    sourceFile: 'contracts/Vault.sol',
    contract: 'Vault',
    function: 'withdraw',
    lineStart: 10,
    lineEnd: 10,
    description: 'Reentrancy detected.',
    source: 'slither',
    verificationStatus: 'verified',
  }

  it('accepts valid evidence', () => {
    expect(EvidenceSchema.safeParse(base).success).toBe(true)
  })

  it('accepts null optional fields', () => {
    expect(EvidenceSchema.safeParse({ ...base, sourceFile: null, contract: null, function: null, lineStart: null, lineEnd: null }).success).toBe(true)
  })

  it('rejects an invalid evidence type', () => {
    expect(EvidenceSchema.safeParse({ ...base, type: 'unknown_type' }).success).toBe(false)
  })

  it('rejects an invalid source', () => {
    expect(EvidenceSchema.safeParse({ ...base, source: 'human_auditor' }).success).toBe(false)
  })

  it('rejects an invalid verification status', () => {
    expect(EvidenceSchema.safeParse({ ...base, verificationStatus: 'confirmed' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------
describe('FindingSchema', () => {
  const base = {
    id: 'F-001',
    category: 'reentrancy',
    title: 'Reentrancy in Vault.withdraw',
    severity: 'high',
    status: 'detected',
    relationship: 'chain',
    description: 'External call before state update.',
    contract: 'Vault',
    function: 'withdraw',
    sourceLocation: { file: 'contracts/Vault.sol', lineStart: 10, lineEnd: 15 },
    detector: 'slither:reentrancy-eth',
    evidenceReferences: ['EV-abc12345'],
    relatedFindings: [],
    chainIds: ['AC-001'],
    confidence: 0.85,
  }

  it('accepts a valid finding', () => {
    expect(FindingSchema.safeParse(base).success).toBe(true)
  })

  it('accepts null optional fields', () => {
    expect(FindingSchema.safeParse({ ...base, contract: null, function: null, sourceLocation: null, detector: null }).success).toBe(true)
  })

  it('rejects confidence outside [0,1]', () => {
    expect(FindingSchema.safeParse({ ...base, confidence: 1.1 }).success).toBe(false)
    expect(FindingSchema.safeParse({ ...base, confidence: -0.1 }).success).toBe(false)
  })

  it('rejects unknown category', () => {
    expect(FindingSchema.safeParse({ ...base, category: 'unknown' }).success).toBe(false)
  })

  it('rejects unknown severity', () => {
    expect(FindingSchema.safeParse({ ...base, severity: 'extreme' }).success).toBe(false)
  })

  it('rejects unknown relationship', () => {
    expect(FindingSchema.safeParse({ ...base, relationship: 'conflated' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AttackStep
// ---------------------------------------------------------------------------
describe('AttackStepSchema', () => {
  const base = {
    id: 'AC-001-S1',
    order: 1,
    type: 'attacker_action',
    title: 'Call unprotected setter',
    contract: 'Oracle',
    function: 'setPool',
    sourceLocation: { file: 'contracts/Oracle.sol', lineStart: 12, lineEnd: 14 },
    description: 'setPool has no access control.',
    reason: 'Mapper flagged unrestricted write to pool.',
    dependencies: [],
    evidence: ['EV-abc12345'],
    findingIds: ['F-001'],
    assumptions: [],
    confidence: 0.8,
  }

  it('accepts a valid step', () => {
    expect(AttackStepSchema.safeParse(base).success).toBe(true)
  })

  it('rejects order < 1', () => {
    expect(AttackStepSchema.safeParse({ ...base, order: 0 }).success).toBe(false)
  })

  it('rejects unknown step type', () => {
    expect(AttackStepSchema.safeParse({ ...base, type: 'magic' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BreakPoint
// ---------------------------------------------------------------------------
describe('BreakPointSchema', () => {
  const base = {
    id: 'AC-001-BP1',
    title: 'Restrict Oracle.setPool',
    location: {
      file: 'contracts/Oracle.sol',
      lineStart: 12,
      lineEnd: 14,
      contract: 'Oracle',
      function: 'setPool',
    },
    recommendation: 'Add onlyOwner modifier.',
    rationale: 'Prevents unauthorized pool replacement.',
    affectedStepIds: ['AC-001-S1', 'AC-001-S2'],
    confidence: 0.9,
  }

  it('accepts a valid break point', () => {
    expect(BreakPointSchema.safeParse(base).success).toBe(true)
  })

  it('accepts null function in location', () => {
    expect(BreakPointSchema.safeParse({ ...base, location: { ...base.location, function: null } }).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AttackChain
// ---------------------------------------------------------------------------
describe('AttackChainSchema', () => {
  const step = {
    id: 'AC-001-S1',
    order: 1,
    type: 'attacker_action',
    title: 'Call unprotected setter',
    contract: 'Oracle',
    function: 'setPool',
    sourceLocation: null,
    description: 'No access control.',
    reason: 'Mapper flagged it.',
    dependencies: [],
    evidence: [],
    findingIds: [],
    assumptions: [],
    confidence: 0.8,
  }
  const bp = {
    id: 'AC-001-BP1',
    title: 'Restrict setPool',
    location: { file: 'contracts/Oracle.sol', lineStart: 12, lineEnd: 14, contract: 'Oracle', function: null },
    recommendation: 'Add onlyOwner.',
    rationale: 'Prevents chain start.',
    affectedStepIds: ['AC-001-S1'],
    confidence: 0.9,
  }
  const base = {
    id: 'AC-001',
    title: 'Potential price manipulation via Oracle.setPool',
    summary: 'Any account can replace the pool.',
    severity: 'high',
    confidence: 0.77,
    supportLevel: 'moderate',
    status: 'supported',
    entryPoint: { contract: 'LendingVault', function: 'borrow', sourceLocation: null },
    preconditions: ['Attacker controls liquidity.'],
    steps: [step],
    evidence: [],
    impact: { summary: 'ETH can be drained.', assetsAtRisk: ['ETH held by LendingVault'] },
    relatedFindingIds: ['F-001'],
    contractsInvolved: ['Oracle', 'LendingVault'],
    breakPoints: [bp],
    confidenceChecks: [{ label: 'Source code located', status: 'met', detail: null }],
    assumptions: [],
    limitations: ['Runtime not confirmed.'],
  }

  it('accepts a valid attack chain', () => {
    expect(AttackChainSchema.safeParse(base).success).toBe(true)
  })

  it('rejects chain with no steps', () => {
    expect(AttackChainSchema.safeParse({ ...base, steps: [] }).success).toBe(false)
  })

  it('rejects unknown support level', () => {
    expect(AttackChainSchema.safeParse({ ...base, supportLevel: 'excellent' }).success).toBe(false)
  })

  it('rejects confidence outside [0,1]', () => {
    expect(AttackChainSchema.safeParse({ ...base, confidence: 2 }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------
describe('RepositorySchema', () => {
  const base = {
    id: 'abc123',
    name: 'my-defi',
    sourceType: 'github',
    sourceReference: 'https://github.com/user/repo',
    status: 'complete',
    solidityFiles: ['contracts/Vault.sol'],
    contractsCount: 3,
    functionsCount: 12,
    externalCallsCount: 4,
    privilegedFunctionsCount: 2,
    oracleDependenciesCount: 1,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }

  it('accepts a valid repository', () => {
    expect(RepositorySchema.safeParse(base).success).toBe(true)
  })

  it('rejects negative counts', () => {
    expect(RepositorySchema.safeParse({ ...base, contractsCount: -1 }).success).toBe(false)
  })

  it('rejects unknown source type', () => {
    expect(RepositorySchema.safeParse({ ...base, sourceType: 'ftp' }).success).toBe(false)
  })

  it('accepts null completedAt', () => {
    expect(RepositorySchema.safeParse({ ...base, completedAt: null }).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// RepositoryMap
// ---------------------------------------------------------------------------
describe('RepositoryMapSchema', () => {
  it('accepts an empty map', () => {
    expect(RepositoryMapSchema.safeParse({ contracts: [], relationships: [], oracleDependencies: [], trustBoundaries: [] }).success).toBe(true)
  })

  it('accepts a map with contracts', () => {
    const map = {
      contracts: [
        {
          name: 'Vault',
          kind: 'contract',
          file: 'contracts/Vault.sol',
          lineStart: 1,
          lineEnd: 50,
          imports: [],
          stateVariables: ['owner', 'balances'],
          functions: [
            {
              name: 'withdraw',
              visibility: 'external',
              mutability: 'nonpayable',
              modifiers: [],
              privileged: false,
              lineStart: 10,
              lineEnd: 20,
              externalCalls: [{ target: 'msg.sender', kind: 'low_level_call', line: 15 }],
              stateReads: ['balances'],
              stateWrites: ['balances'],
            },
          ],
        },
      ],
      relationships: [{ from: 'Vault', to: 'Oracle', kind: 'reads_oracle' }],
      oracleDependencies: [{ contract: 'Vault', function: 'withdraw', target: 'Oracle.getPrice', line: 14 }],
      trustBoundaries: [{ id: 'tb-1', description: 'External prices', contracts: ['Vault'] }],
    }
    expect(RepositoryMapSchema.safeParse(map).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AnalysisStatusPayload
// ---------------------------------------------------------------------------
describe('AnalysisStatusPayloadSchema', () => {
  it('accepts a queued status', () => {
    const result = AnalysisStatusPayloadSchema.safeParse({
      id: 'abc123',
      status: 'queued',
      stages: [],
      error: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects unknown status', () => {
    const result = AnalysisStatusPayloadSchema.safeParse({
      id: 'abc123',
      status: 'processing',
      stages: [],
      error: null,
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SourceFile
// ---------------------------------------------------------------------------
describe('SourceFileSchema', () => {
  it('accepts a valid source file', () => {
    expect(SourceFileSchema.safeParse({ path: 'contracts/Vault.sol', content: '// SPDX...' }).success).toBe(true)
  })
})
