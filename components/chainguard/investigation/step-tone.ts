import type { AttackStepType } from '@/lib/domain/schemas'

export const STEP_TONE: Record<AttackStepType, { border: string; text: string }> = {
  attacker_action: { border: 'border-l-severity-high', text: 'text-severity-high' },
  vulnerability: { border: 'border-l-severity-critical', text: 'text-severity-critical' },
  state_change: { border: 'border-l-primary', text: 'text-primary' },
  external_dependency: { border: 'border-l-severity-medium', text: 'text-severity-medium' },
  contract_function: { border: 'border-l-severity-low', text: 'text-severity-low' },
  impact: { border: 'border-l-destructive', text: 'text-destructive' },
}
