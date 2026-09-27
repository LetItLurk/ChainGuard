import { Check, Circle, Loader2, MinusCircle, X } from 'lucide-react'
import { STAGE_LABEL } from '@/lib/domain/labels'
import type { AnalysisStage, StageStatus } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'

const STATUS_TEXT: Record<StageStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  complete: 'Complete',
  failed: 'Failed',
  skipped: 'Skipped',
}

function StageIcon({ status }: { status: StageStatus }) {
  const cls = 'size-3.5'
  switch (status) {
    case 'complete':
      return <Check aria-hidden className={cn(cls, 'text-verified')} />
    case 'running':
      return <Loader2 aria-hidden className={cn(cls, 'animate-spin text-primary')} />
    case 'failed':
      return <X aria-hidden className={cn(cls, 'text-destructive')} />
    case 'skipped':
      return <MinusCircle aria-hidden className={cn(cls, 'text-muted-foreground')} />
    default:
      return <Circle aria-hidden className={cn(cls, 'text-muted-foreground/50')} />
  }
}

function duration(stage: AnalysisStage): string | null {
  if (!stage.startedAt || !stage.completedAt) return null
  const ms = new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function StageList({ stages, dense = false }: { stages: AnalysisStage[]; dense?: boolean }) {
  return (
    <ol className="flex flex-col">
      {stages.map((stage, index) => (
        <li
          key={stage.name}
          className={cn(
            'grid grid-cols-[1.25rem_1fr_auto] items-start gap-x-3 border-b last:border-b-0',
            dense ? 'py-2' : 'py-3',
            stage.status === 'pending' && 'text-muted-foreground',
          )}
        >
          <span className="flex h-5 items-center">
            <StageIcon status={stage.status} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm">
              <span className="mr-2 font-mono text-xs text-muted-foreground tabular-nums">{String(index + 1).padStart(2, '0')}</span>
              {STAGE_LABEL[stage.name]}
            </span>
            {stage.message && !dense && <span className="text-xs text-muted-foreground">{stage.message}</span>}
          </div>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {duration(stage) && <span className="font-mono tabular-nums">{duration(stage)}</span>}
            <span className={cn(stage.status === 'failed' && 'text-destructive', stage.status === 'running' && 'text-primary')}>
              {STATUS_TEXT[stage.status]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
