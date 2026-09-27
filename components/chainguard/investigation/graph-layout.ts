import type { AttackChain } from '@/lib/domain/schemas'

export const NODE_W = 236
export const NODE_H = 78
const GAP_X = 36
const GAP_Y = 44
const BP_OFFSET = 96

export type Position = { x: number; y: number }

/**
 * Deterministic layered layout for the step DAG. Depth is the longest path
 * from a root; roots are then pulled down to sit just above their first
 * dependent so parallel branches (e.g. "deposit collateral") join where they
 * are used rather than floating at the top.
 */
export function layoutChain(chain: AttackChain): { steps: Map<string, Position>; breakPoints: Map<string, Position> } {
  const byId = new Map(chain.steps.map((s) => [s.id, s]))
  const depth = new Map<string, number>()

  const resolve = (id: string, seen: Set<string>): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    const step = byId.get(id)
    if (!step || seen.has(id)) return 0
    seen.add(id)
    const deps = step.dependencies.filter((d) => byId.has(d))
    const d = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => resolve(dep, seen))) + 1
    depth.set(id, d)
    return d
  }
  for (const step of chain.steps) resolve(step.id, new Set())

  for (const step of chain.steps) {
    if (step.dependencies.length > 0) continue
    const children = chain.steps.filter((s) => s.dependencies.includes(step.id))
    if (children.length === 0) continue
    const target = Math.min(...children.map((c) => depth.get(c.id) ?? 1)) - 1
    depth.set(step.id, Math.max(depth.get(step.id) ?? 0, target))
  }

  const rows = new Map<number, string[]>()
  for (const step of [...chain.steps].sort((a, b) => a.order - b.order)) {
    const d = depth.get(step.id) ?? 0
    rows.set(d, [...(rows.get(d) ?? []), step.id])
  }

  const steps = new Map<string, Position>()
  let maxHalf = 0
  for (const [d, ids] of rows) {
    ids.forEach((id, col) => {
      const offset = (col - (ids.length - 1) / 2) * (NODE_W + GAP_X)
      maxHalf = Math.max(maxHalf, Math.abs(offset))
      steps.set(id, { x: offset, y: d * (NODE_H + GAP_Y) })
    })
  }

  const bpX = maxHalf + NODE_W + BP_OFFSET
  const placed = chain.breakPoints
    .map((bp) => {
      const ys = bp.affectedStepIds.map((id) => steps.get(id)?.y).filter((y): y is number => y !== undefined)
      return { id: bp.id, y: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0 }
    })
    .sort((a, b) => a.y - b.y)

  const breakPoints = new Map<string, Position>()
  let lastY = -Infinity
  for (const bp of placed) {
    const y = Math.max(bp.y, lastY + NODE_H + 16)
    breakPoints.set(bp.id, { x: bpX, y })
    lastY = y
  }

  return { steps, breakPoints }
}
