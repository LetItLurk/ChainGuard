import { z } from 'zod'

/**
 * Canonical ChainGuard domain contract.
 *
 * These schemas mirror `backend/app/models/domain.py`. Every payload that
 * crosses a trust boundary (backend API, AI output, fixtures) is parsed with
 * them before reaching UI code.
 */

export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'informational'])

/**
 * How well a claim is supported.
 * - detected: reported by a deterministic static detector
 * - supported: claim validated against source and at least one static relationship
 * - potential: plausible, partially supported
 * - unverified: could not be validated against the repository
 */
export const SupportStatusSchema = z.enum(['detected', 'supported', 'potential', 'unverified'])

export const RelationshipStatusSchema = z.enum(['chain', 'related', 'isolated', 'unverified'])

export const FindingCategorySchema = z.enum([
  'reentrancy',
  'access_control',
  'oracle_manipulation',
  'flash_loan_surface',
  'unchecked_external_call',
  'logic_arithmetic',
  'other',
])

export const SourceLocationSchema = z.object({
  file: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
})

export const EvidenceTypeSchema = z.enum([
  'source',
  'function',
  'call_dependency',
  'state_dependency',
  'static_detector',
  'external_dependency',
  'access_control',
  'ai_reasoning',
])

export const EvidenceOriginSchema = z.enum(['slither', 'mapper', 'ai', 'validator', 'fixture'])

export const VerificationStatusSchema = z.enum(['verified', 'partial', 'unverified', 'failed'])

export const EvidenceSchema = z.object({
  id: z.string(),
  type: EvidenceTypeSchema,
  sourceFile: z.string().nullable(),
  contract: z.string().nullable(),
  function: z.string().nullable(),
  lineStart: z.number().int().positive().nullable(),
  lineEnd: z.number().int().positive().nullable(),
  description: z.string(),
  source: EvidenceOriginSchema,
  verificationStatus: VerificationStatusSchema,
})

export const FindingSchema = z.object({
  id: z.string(),
  category: FindingCategorySchema,
  title: z.string(),
  severity: SeveritySchema,
  status: SupportStatusSchema,
  relationship: RelationshipStatusSchema,
  description: z.string(),
  contract: z.string().nullable(),
  function: z.string().nullable(),
  sourceLocation: SourceLocationSchema.nullable(),
  detector: z.string().nullable(),
  evidenceReferences: z.array(z.string()),
  relatedFindings: z.array(z.string()),
  chainIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export const AttackStepTypeSchema = z.enum([
  'attacker_action',
  'contract_function',
  'state_change',
  'external_dependency',
  'vulnerability',
  'impact',
])

export const AttackStepSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  type: AttackStepTypeSchema,
  title: z.string(),
  contract: z.string().nullable(),
  function: z.string().nullable(),
  sourceLocation: SourceLocationSchema.nullable(),
  description: z.string(),
  reason: z.string(),
  dependencies: z.array(z.string()),
  evidence: z.array(z.string()),
  findingIds: z.array(z.string()),
  assumptions: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export const BreakPointSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: SourceLocationSchema.extend({
    contract: z.string(),
    function: z.string().nullable(),
  }),
  recommendation: z.string(),
  rationale: z.string(),
  affectedStepIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export const ConfidenceCheckSchema = z.object({
  label: z.string(),
  status: z.enum(['met', 'unmet', 'unavailable']),
  detail: z.string().nullable(),
})

export const SupportLevelSchema = z.enum(['strong', 'moderate', 'weak'])

export const AttackChainSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  severity: SeveritySchema,
  confidence: z.number().min(0).max(1),
  supportLevel: SupportLevelSchema,
  status: SupportStatusSchema,
  entryPoint: z.object({
    contract: z.string(),
    function: z.string(),
    sourceLocation: SourceLocationSchema.nullable(),
  }),
  preconditions: z.array(z.string()),
  steps: z.array(AttackStepSchema).min(1),
  evidence: z.array(z.string()),
  impact: z.object({
    summary: z.string(),
    assetsAtRisk: z.array(z.string()),
  }),
  relatedFindingIds: z.array(z.string()),
  contractsInvolved: z.array(z.string()),
  breakPoints: z.array(BreakPointSchema),
  confidenceChecks: z.array(ConfidenceCheckSchema),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
})

export const ExternalCallSchema = z.object({
  target: z.string(),
  kind: z.enum(['low_level_call', 'transfer', 'send', 'delegatecall', 'contract_call']),
  line: z.number().int().positive(),
})

export const ContractFunctionSchema = z.object({
  name: z.string(),
  visibility: z.enum(['public', 'external', 'internal', 'private']),
  mutability: z.enum(['pure', 'view', 'payable', 'nonpayable']),
  modifiers: z.array(z.string()),
  privileged: z.boolean(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  externalCalls: z.array(ExternalCallSchema),
  stateReads: z.array(z.string()),
  stateWrites: z.array(z.string()),
})

export const ContractSchema = z.object({
  name: z.string(),
  kind: z.enum(['contract', 'interface', 'library', 'abstract']),
  file: z.string(),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  imports: z.array(z.string()),
  stateVariables: z.array(z.string()),
  functions: z.array(ContractFunctionSchema),
})

export const ContractRelationshipSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(['calls', 'inherits', 'imports', 'reads_oracle']),
})

export const RepositoryMapSchema = z.object({
  contracts: z.array(ContractSchema),
  relationships: z.array(ContractRelationshipSchema),
  oracleDependencies: z.array(
    z.object({ contract: z.string(), function: z.string(), target: z.string(), line: z.number().int().positive() }),
  ),
  trustBoundaries: z.array(z.object({ id: z.string(), description: z.string(), contracts: z.array(z.string()) })),
})

export const AnalysisStageNameSchema = z.enum([
  'ingestion',
  'mapping',
  'static_analysis',
  'dependency_mapping',
  'ai_investigation',
  'evidence_validation',
  'chain_construction',
  'report_preparation',
])

export const StageStatusSchema = z.enum(['pending', 'running', 'complete', 'failed', 'skipped'])

export const AnalysisStageSchema = z.object({
  name: AnalysisStageNameSchema,
  status: StageStatusSchema,
  message: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
})

export const AnalysisStatusSchema = z.enum(['queued', 'running', 'complete', 'failed'])

export const RepositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceType: z.enum(['github', 'zip', 'fixture']),
  sourceReference: z.string(),
  status: AnalysisStatusSchema,
  solidityFiles: z.array(z.string()),
  contractsCount: z.number().int().nonnegative(),
  functionsCount: z.number().int().nonnegative(),
  externalCallsCount: z.number().int().nonnegative(),
  privilegedFunctionsCount: z.number().int().nonnegative(),
  oracleDependenciesCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})

export const DiagnosticSchema = z.object({
  level: z.enum(['info', 'warning', 'error']),
  stage: AnalysisStageNameSchema,
  message: z.string(),
})

export const AnalysisStatusPayloadSchema = z.object({
  id: z.string(),
  status: AnalysisStatusSchema,
  stages: z.array(AnalysisStageSchema),
  error: z.string().nullable(),
})

export const AnalysisSchema = z.object({
  id: z.string(),
  mode: z.enum(['live', 'fixture']),
  status: AnalysisStatusSchema,
  repository: RepositorySchema,
  stages: z.array(AnalysisStageSchema),
  staticAnalysis: z.object({
    tool: z.string(),
    status: z.enum(['complete', 'failed', 'unavailable', 'fixture']),
    message: z.string().nullable(),
  }),
  aiStatus: z.enum(['complete', 'unavailable', 'skipped', 'fixture']),
  repositoryMap: RepositoryMapSchema,
  findings: z.array(FindingSchema),
  attackChains: z.array(AttackChainSchema),
  evidence: z.array(EvidenceSchema),
  diagnostics: z.array(DiagnosticSchema),
  limitations: z.array(z.string()),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})

export const SourceFileSchema = z.object({
  path: z.string(),
  content: z.string(),
})

export type Severity = z.infer<typeof SeveritySchema>
export type SupportStatus = z.infer<typeof SupportStatusSchema>
export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>
export type FindingCategory = z.infer<typeof FindingCategorySchema>
export type SourceLocation = z.infer<typeof SourceLocationSchema>
export type Evidence = z.infer<typeof EvidenceSchema>
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>
export type Finding = z.infer<typeof FindingSchema>
export type AttackStep = z.infer<typeof AttackStepSchema>
export type AttackStepType = z.infer<typeof AttackStepTypeSchema>
export type BreakPoint = z.infer<typeof BreakPointSchema>
export type ConfidenceCheck = z.infer<typeof ConfidenceCheckSchema>
export type SupportLevel = z.infer<typeof SupportLevelSchema>
export type AttackChain = z.infer<typeof AttackChainSchema>
export type Contract = z.infer<typeof ContractSchema>
export type ContractFunction = z.infer<typeof ContractFunctionSchema>
export type RepositoryMap = z.infer<typeof RepositoryMapSchema>
export type AnalysisStageName = z.infer<typeof AnalysisStageNameSchema>
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>
export type StageStatus = z.infer<typeof StageStatusSchema>
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>
export type AnalysisStatusPayload = z.infer<typeof AnalysisStatusPayloadSchema>
export type Repository = z.infer<typeof RepositorySchema>
export type Analysis = z.infer<typeof AnalysisSchema>
export type SourceFile = z.infer<typeof SourceFileSchema>
