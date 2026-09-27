'use client'

import { memo, useCallback, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Maximize2, ShieldCheck } from 'lucide-react'
import { STEP_TYPE_LABEL } from '@/lib/domain/labels'
import type { AttackChain, AttackStep, BreakPoint } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'
import { NODE_H, NODE_W, layoutChain } from './graph-layout'
import { STEP_TONE } from './step-tone'

function FitViewButton() {
  const { fitView } = useReactFlow()
  const handleFit = useCallback(() => void fitView({ padding: 0.15, duration: 300 }), [fitView])
  return (
    <button
      type="button"
      onClick={handleFit}
      aria-label="Fit graph to view"
      title="Fit to view"
      className="absolute bottom-14 right-3 z-10 flex size-8 items-center justify-center rounded-md border border-border bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card hover:text-foreground"
    >
      <Maximize2 aria-hidden className="size-3.5" />
    </button>
  )
}

type StepData = { step: AttackStep; active: boolean; dimmed: boolean; entry: boolean }
type BreakData = { breakPoint: BreakPoint; index: number; active: boolean }
type StepNode = Node<StepData, 'step'>
type BreakNode = Node<BreakData, 'breakPoint'>

const hidden = '!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-transparent'

const StepNodeView = memo(function StepNodeView({ data }: NodeProps<StepNode>) {
  const { step, active, dimmed, entry } = data as StepData
  const tone = STEP_TONE[step.type]
  return (
    <div
      style={{ width: NODE_W, height: NODE_H }}
      className={cn(
        'flex cursor-pointer flex-col justify-between rounded-md border border-l-2 bg-card px-3 py-2 text-left transition-[opacity,box-shadow,border-color]',
        tone.border,
        active && 'border-primary shadow-[0_0_0_1px_var(--primary)]',
        dimmed && 'opacity-40',
      )}
    >
      <Handle type="target" position={Position.Top} className={hidden} isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-mono text-[10px] uppercase tracking-wider', tone.text)}>
          {String(step.order).padStart(2, '0')} · {STEP_TYPE_LABEL[step.type]}
        </span>
        {entry && <span className="rounded-sm bg-primary/15 px-1 font-mono text-[10px] text-primary">ENTRY</span>}
      </div>
      <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-foreground">{step.title}</p>
      <p className="truncate font-mono text-[10.5px] text-muted-foreground">
        {step.contract ?? 'External'}
        {step.function ? `.${step.function}()` : ''}
      </p>
      <Handle type="source" position={Position.Bottom} className={hidden} isConnectable={false} />
      <Handle id="bp" type="target" position={Position.Right} className={hidden} isConnectable={false} />
    </div>
  )
})

const BreakNodeView = memo(function BreakNodeView({ data }: NodeProps<BreakNode>) {
  const { breakPoint, index, active } = data
  return (
    <div
      style={{ width: NODE_W - 20, minHeight: NODE_H - 10 }}
      className={cn(
        'flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-verified/50 bg-verified/5 px-3 py-2 transition-shadow',
        active && 'border-solid border-verified shadow-[0_0_0_1px_var(--verified)]',
      )}
    >
      <Handle type="source" position={Position.Left} className={hidden} isConnectable={false} />
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-verified">
        <ShieldCheck aria-hidden className="size-3" /> Break point {index + 1}
      </span>
      <p className="line-clamp-2 text-[12px] font-medium leading-snug">{breakPoint.title}</p>
    </div>
  )
})

const nodeTypes = { step: StepNodeView, breakPoint: BreakNodeView }

export type GraphSelection = { kind: 'step'; id: string } | { kind: 'breakPoint'; id: string }

export function AttackGraph({
  chain,
  selection,
  highlightedStepIds,
  onSelect,
}: {
  chain: AttackChain
  selection: GraphSelection
  highlightedStepIds: Set<string>
  onSelect: (selection: GraphSelection) => void
}) {
  const layout = useMemo(() => layoutChain(chain), [chain])

  const nodes = useMemo<(StepNode | BreakNode)[]>(() => {
    const focusing = selection.kind === 'breakPoint'
    const stepNodes: StepNode[] = chain.steps.map((step) => ({
      id: step.id,
      type: 'step',
      position: layout.steps.get(step.id) ?? { x: 0, y: 0 },
      draggable: false,
      data: {
        step,
        active: highlightedStepIds.has(step.id),
        dimmed: focusing && !highlightedStepIds.has(step.id),
        entry: step.contract === chain.entryPoint.contract && step.function === chain.entryPoint.function,
      },
    }))
    const bpNodes: BreakNode[] = chain.breakPoints.map((bp, index) => ({
      id: bp.id,
      type: 'breakPoint',
      position: layout.breakPoints.get(bp.id) ?? { x: 0, y: 0 },
      draggable: false,
      data: { breakPoint: bp, index, active: selection.kind === 'breakPoint' && selection.id === bp.id },
    }))
    return [...stepNodes, ...bpNodes]
  }, [chain, layout, selection, highlightedStepIds])

  const edges = useMemo<Edge[]>(() => {
    const flow: Edge[] = chain.steps.flatMap((step) =>
      step.dependencies.map((dep) => {
        const lit = highlightedStepIds.has(step.id) && highlightedStepIds.has(dep)
        return {
          id: `${dep}->${step.id}`,
          source: dep,
          target: step.id,
          type: 'smoothstep',
          animated: lit,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: lit ? 'var(--primary)' : 'var(--muted-foreground)' },
          style: { stroke: lit ? 'var(--primary)' : 'var(--muted-foreground)', strokeOpacity: lit ? 1 : 0.5, strokeWidth: 1.25 },
        }
      }),
    )
    const breaks: Edge[] = chain.breakPoints.flatMap((bp) =>
      bp.affectedStepIds.map((stepId) => {
        const lit = selection.kind === 'breakPoint' && selection.id === bp.id
        return {
          id: `${bp.id}->${stepId}`,
          source: bp.id,
          target: stepId,
          targetHandle: 'bp',
          type: 'smoothstep',
          style: {
            stroke: 'var(--verified)',
            strokeDasharray: '4 4',
            strokeOpacity: lit ? 1 : 0.35,
            strokeWidth: lit ? 1.5 : 1,
          },
        }
      }),
    )
    return [...flow, ...breaks]
  }, [chain, highlightedStepIds, selection])

  return (
    <div className="relative h-full min-h-[420px] w-full" aria-hidden>
      {/* Node / break-point count badge */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded-sm border bg-card/80 px-1.5 py-0.5 font-mono backdrop-blur-sm">
          {chain.steps.length}S · {chain.breakPoints.length}BP
        </span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        onNodeClick={(_, node) => onSelect({ kind: node.type === 'breakPoint' ? 'breakPoint' : 'step', id: node.id })}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-left" />
        <FitViewButton />
      </ReactFlow>
    </div>
  )
}
