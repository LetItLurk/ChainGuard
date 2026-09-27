'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { STAGE_LABEL } from '@/lib/domain/labels'
import { AnalysisStatusPayloadSchema, type AnalysisStage, type AnalysisStatusPayload } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'

async function fetchStatus(url: string): Promise<AnalysisStatusPayload> {
  const response = await fetch(url, { cache: 'no-store' })
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = (json as { detail?: string } | null)?.detail
    throw new Error(detail ?? 'Status unavailable.')
  }
  return AnalysisStatusPayloadSchema.parse(json)
}

function useElapsed(running: boolean) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())
  useEffect(() => {
    if (!running) { setElapsed(0); return }
    startRef.current = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500)
    return () => clearInterval(id)
  }, [running])
  return elapsed
}

function formatElapsed(s: number) {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function StageDuration({ stage }: { stage: AnalysisStage }) {
  if (!stage.startedAt || !stage.completedAt) return null
  const ms = new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const text = ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  return <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{text}</span>
}

function StageRow({ stage, index }: { stage: AnalysisStage; index: number }) {
  const running = stage.status === 'running'
  const complete = stage.status === 'complete'
  const failed = stage.status === 'failed'
  const skipped = stage.status === 'skipped'

  return (
    <li
      className={cn(
        'grid grid-cols-[2rem_1fr_auto] items-start gap-x-3 border-b px-5 py-3.5 last:border-b-0',
        'transition-colors duration-200',
        running && 'bg-primary/5',
        failed && 'bg-destructive/5',
      )}
    >
      {/* Icon */}
      <span className="flex size-8 items-center justify-center">
        {complete ? (
          <CheckCircle2 aria-label="Complete" className="size-4 text-verified" />
        ) : running ? (
          <Loader2 aria-label="Running" className="size-4 animate-spin text-primary" />
        ) : failed ? (
          <XCircle aria-label="Failed" className="size-4 text-destructive" />
        ) : (
          <span
            aria-hidden
            className={cn(
              'flex size-5 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums',
              skipped ? 'border-muted-foreground/30 text-muted-foreground/50' : 'border-muted-foreground/20 text-muted-foreground/40',
            )}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
      </span>

      {/* Label + message */}
      <div className="flex flex-col gap-0.5 pt-1">
        <span
          className={cn(
            'text-sm font-medium',
            stage.status === 'pending' && 'text-muted-foreground/60',
            skipped && 'text-muted-foreground/50',
            running && 'text-foreground',
          )}
        >
          {STAGE_LABEL[stage.name]}
        </span>
        {stage.message && stage.status !== 'pending' && (
          <span
            className={cn(
              'text-xs leading-snug',
              failed ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {stage.message}
          </span>
        )}
      </div>

      {/* Duration / status */}
      <div className="flex items-center gap-2 pt-1">
        <StageDuration stage={stage} />
        <span
          className={cn(
            'font-mono text-[11px] uppercase tracking-wide',
            complete && 'text-verified',
            running && 'text-primary',
            failed && 'text-destructive',
            skipped && 'text-muted-foreground/50',
            stage.status === 'pending' && 'text-muted-foreground/30',
          )}
        >
          {stage.status}
        </span>
      </div>
    </li>
  )
}

export function AnalysisProgress({ id, initial }: { id: string; initial: AnalysisStatusPayload }) {
  const router = useRouter()
  const { data, error } = useSWR(`/api/analyses/${id}/status`, fetchStatus, {
    fallbackData: initial,
    refreshInterval: (latest) => (!latest || latest.status === 'complete' || latest.status === 'failed' ? 0 : 1500),
    revalidateOnFocus: false,
  })

  const status = data?.status ?? initial.status
  const isRunning = status === 'queued' || status === 'running'
  const elapsed = useElapsed(isRunning)

  useEffect(() => {
    if (status === 'complete') router.refresh()
  }, [status, router])

  const stages = data?.stages ?? initial.stages
  const done = stages.filter((s) => s.status === 'complete' || s.status === 'skipped').length
  const total = stages.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const running = stages.find((s) => s.status === 'running')

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_20rem]">
      <section aria-labelledby="progress-heading" className="flex flex-col gap-0 overflow-hidden rounded-md border bg-card">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
          <div className="flex flex-col gap-1">
            <h2 id="progress-heading" className="font-medium">
              {status === 'failed' ? 'Analysis failed' : status === 'complete' ? 'Analysis complete' : 'Analyzing repository'}
            </h2>
            <p className="text-sm text-muted-foreground" aria-live="polite" aria-atomic>
              {status === 'failed'
                ? (data?.error ?? 'The pipeline stopped. Review the stage messages below.')
                : status === 'complete'
                ? 'All stages complete. Loading results…'
                : running
                ? `Running: ${STAGE_LABEL[running.name]}`
                : `${done} of ${total} stages complete`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isRunning && (
              <span className="font-mono text-sm tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>
            )}
            {isRunning && <Loader2 aria-hidden className="size-4 animate-spin text-primary" />}
          </div>
        </header>

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Analysis progress: ${pct}%`}
          className="h-0.5 bg-border"
        >
          <div
            className={cn(
              'h-full transition-all duration-700 ease-out',
              status === 'failed' ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stage rows */}
        <ol aria-label="Pipeline stages">
          {stages.map((stage, i) => (
            <StageRow key={stage.name} stage={stage} index={i} />
          ))}
        </ol>
      </section>

      {/* Sidebar */}
      <aside className="flex flex-col gap-4">
        {error && (
          <div role="status" className="flex gap-3 rounded-md border border-partial/40 bg-partial/5 p-4 text-sm">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-partial" />
            <p>
              Live status temporarily unavailable ({error.message}). Last known state shown; polling continues.
            </p>
          </div>
        )}

        {/* What is happening */}
        <div className="rounded-md border bg-card p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">What ChainGuard is doing</p>
          <ol className="flex flex-col gap-2.5 text-sm text-muted-foreground">
            {[
              { label: 'SCAN', desc: 'Detecting vulnerabilities in each Solidity file' },
              { label: 'CONNECT', desc: 'Mapping call graphs, state flow, oracle dependencies' },
              { label: 'INVESTIGATE', desc: 'AI reasoning over the structured security context' },
              { label: 'VERIFY', desc: 'Validating every AI claim against the repository map' },
              { label: 'BREAK', desc: 'Constructing break points for each attack chain' },
            ].map(({ label, desc }) => (
              <li key={label} className="flex gap-2">
                <span className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-primary shrink-0 w-[72px]">{label}</span>
                <span>{desc}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-md border p-4 text-sm leading-relaxed text-muted-foreground">
          ChainGuard performs static analysis and AI-assisted investigation. Repository code is never executed. Results are potential findings that require manual verification.
        </div>

        {status === 'failed' && (
          <div className="flex flex-col gap-2">
            <Button asChild size="sm">
              <Link href="/analyze">Start a new analysis</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/analyses/demo">Open Demo Analysis</Link>
            </Button>
          </div>
        )}
      </aside>
    </main>
  )
}
