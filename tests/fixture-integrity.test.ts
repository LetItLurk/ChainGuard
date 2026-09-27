/**
 * Demo fixture integrity tests.
 *
 * The demo analysis drives the product experience before the full backend
 * pipeline is wired. These tests verify that:
 *
 * 1. DEMO_ANALYSIS passes full schema validation (no type drift)
 * 2. Every attack chain has at least one break point
 * 3. Every attack step has at least one evidence reference
 * 4. Every evidence ID referenced by a step exists in the evidence array
 * 5. Every finding referenced by a chain exists in the findings array
 * 6. Source files referenced in the demo exist in DEMO_SOURCES
 * 7. The demo is explicitly marked as fixture mode
 */

import { describe, it, expect } from 'vitest'
import { DEMO_ANALYSIS, DEMO_SOURCES } from '@/fixtures/demo/demo-analysis'
import { AnalysisSchema } from '@/lib/domain/schemas'

describe('DEMO_ANALYSIS fixture', () => {
  it('passes full AnalysisSchema validation', () => {
    const result = AnalysisSchema.safeParse(DEMO_ANALYSIS)
    if (!result.success) {
      // Surface the first few errors for easier debugging
      const messages = result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`)
      throw new Error(`Schema validation failed:\n${messages.join('\n')}`)
    }
    expect(result.success).toBe(true)
  })

  it('is marked as fixture mode', () => {
    expect(DEMO_ANALYSIS.mode).toBe('fixture')
  })

  it('has status complete', () => {
    expect(DEMO_ANALYSIS.status).toBe('complete')
  })

  it('has at least one attack chain', () => {
    expect(DEMO_ANALYSIS.attackChains.length).toBeGreaterThan(0)
  })

  it('has at least one finding', () => {
    expect(DEMO_ANALYSIS.findings.length).toBeGreaterThan(0)
  })

  it('every attack chain has at least one step', () => {
    for (const chain of DEMO_ANALYSIS.attackChains) {
      expect(chain.steps.length, `${chain.id} has no steps`).toBeGreaterThan(0)
    }
  })

  it('every attack chain has at least one break point', () => {
    for (const chain of DEMO_ANALYSIS.attackChains) {
      expect(chain.breakPoints.length, `${chain.id} has no break points`).toBeGreaterThan(0)
    }
  })

  it('every attack step evidence ID exists in the evidence array', () => {
    const evidenceIds = new Set(DEMO_ANALYSIS.evidence.map((e) => e.id))
    for (const chain of DEMO_ANALYSIS.attackChains) {
      for (const step of chain.steps) {
        for (const evId of step.evidence) {
          expect(evidenceIds.has(evId), `Evidence ${evId} in step ${step.id} not found`).toBe(true)
        }
      }
    }
  })

  it('every chain evidence ID exists in the evidence array', () => {
    const evidenceIds = new Set(DEMO_ANALYSIS.evidence.map((e) => e.id))
    for (const chain of DEMO_ANALYSIS.attackChains) {
      for (const evId of chain.evidence) {
        expect(evidenceIds.has(evId), `Chain evidence ${evId} in ${chain.id} not found`).toBe(true)
      }
    }
  })

  it('every finding referenced by a chain exists in the findings array', () => {
    const findingIds = new Set(DEMO_ANALYSIS.findings.map((f) => f.id))
    for (const chain of DEMO_ANALYSIS.attackChains) {
      for (const fid of chain.relatedFindingIds) {
        expect(findingIds.has(fid), `Finding ${fid} referenced by ${chain.id} not found`).toBe(true)
      }
    }
  })

  it('every source file referenced in steps exists in DEMO_SOURCES', () => {
    const sourcePaths = new Set(DEMO_SOURCES.map((s) => s.path))
    for (const chain of DEMO_ANALYSIS.attackChains) {
      for (const step of chain.steps) {
        if (step.sourceLocation) {
          expect(
            sourcePaths.has(step.sourceLocation.file),
            `Source file ${step.sourceLocation.file} not in DEMO_SOURCES`,
          ).toBe(true)
        }
      }
    }
  })

  it('step orders are sequential starting at 1', () => {
    for (const chain of DEMO_ANALYSIS.attackChains) {
      const orders = chain.steps.map((s) => s.order)
      orders.forEach((order, i) => {
        expect(order, `${chain.id} step ${i} has order ${order}, expected ${i + 1}`).toBe(i + 1)
      })
    }
  })

  it('all findings have valid relationship status', () => {
    const valid = new Set(['chain', 'related', 'isolated', 'unverified'])
    for (const finding of DEMO_ANALYSIS.findings) {
      expect(valid.has(finding.relationship), `${finding.id} has invalid relationship`).toBe(true)
    }
  })

  it('findings that are "in chain" reference at least one chain ID', () => {
    for (const finding of DEMO_ANALYSIS.findings) {
      if (finding.relationship === 'chain') {
        expect(finding.chainIds.length, `${finding.id} is "chain" but has no chainIds`).toBeGreaterThan(0)
      }
    }
  })

  it('repository stats are non-negative integers', () => {
    const repo = DEMO_ANALYSIS.repository
    expect(repo.contractsCount).toBeGreaterThan(0)
    expect(repo.functionsCount).toBeGreaterThan(0)
    expect(Number.isInteger(repo.contractsCount)).toBe(true)
    expect(Number.isInteger(repo.functionsCount)).toBe(true)
    expect(Number.isInteger(repo.externalCallsCount)).toBe(true)
    expect(Number.isInteger(repo.privilegedFunctionsCount)).toBe(true)
    expect(Number.isInteger(repo.oracleDependenciesCount)).toBe(true)
  })

  it('DEMO_SOURCES contains all Solidity files listed in repository', () => {
    const sourcePaths = new Set(DEMO_SOURCES.map((s) => s.path))
    for (const file of DEMO_ANALYSIS.repository.solidityFiles) {
      expect(sourcePaths.has(file), `solidityFiles entry ${file} has no DEMO_SOURCES entry`).toBe(true)
    }
  })

  it('all stages are complete or skipped (not running/failed)', () => {
    for (const stage of DEMO_ANALYSIS.stages) {
      expect(
        stage.status === 'complete' || stage.status === 'skipped',
        `Stage ${stage.name} has status ${stage.status}`,
      ).toBe(true)
    }
  })
})
