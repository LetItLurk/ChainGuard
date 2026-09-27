'use client'

import { useEffect, useRef } from 'react'
import { STEP_TYPE_LABEL } from '@/lib/domain/labels'
import type { AttackStep } from '@/lib/domain/schemas'
import { cn } from '@/lib/utils'
import { STEP_TONE } from './step-tone'

export function StepList({
  steps,
  selectedId,
  highlighted,
  onSelect,
}: {
  steps: AttackStep[]
  selectedId: string | null
  highlighted: Set<string>
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLOListElement>(null)

  // j/k keyboard navigation between steps
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key !== 'j' && e.key !== 'k') return
      const currentIndex = steps.findIndex((s) => s.id === selectedId)
      if (currentIndex === -1) {
        onSelect(steps[0]?.id ?? '')
        return
      }
      const next = e.key === 'j' ? currentIndex + 1 : currentIndex - 1
      const clamped = Math.max(0, Math.min(steps.length - 1, next))
      if (clamped !== currentIndex) {
        onSelect(steps[clamped].id)
        // Scroll the button into view
        const btn = containerRef.current?.children[clamped]?.querySelector('button')
        btn?.scrollIntoView({ block: 'nearest' })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [steps, selectedId, onSelect])

  return (
    <nav aria-label="Attack steps" className="flex min-h-0 flex-col">
      <h3 className="border-b px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Steps ({steps.length})
        <span className="ml-2 text-[10px] font-normal text-muted-foreground/60" aria-hidden>
          j/k
        </span>
      </h3>
      <ol ref={containerRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1.5">
        {steps.map((step) => {
          const selected = step.id === selectedId
          const tone = STEP_TONE[step.type]
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={selected ? 'step' : undefined}
                className={cn(
                  'flex w-full gap-2.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-accent/60',
                  selected && 'bg-accent',
                  !selected && highlighted.has(step.id) && 'bg-verified/10',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px] tabular-nums',
                    selected ? 'border-primary text-primary' : 'text-muted-foreground',
                  )}
                >
                  {step.order}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] leading-snug">{step.title}</span>
                  <span className={cn('text-[11px]', tone.text)}>{STEP_TYPE_LABEL[step.type]}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
