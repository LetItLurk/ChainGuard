'use client'

import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  RELATIONSHIP_LABEL,
  SEVERITY_LABEL,
  SUPPORT_DESCRIPTION,
  SUPPORT_LABEL,
  SUPPORT_LEVEL_LABEL,
  VERIFICATION_LABEL,
  formatConfidence,
} from '@/lib/domain/labels'
import type {
  RelationshipStatus,
  Severity,
  SupportLevel,
  SupportStatus,
  VerificationStatus,
} from '@/lib/domain/schemas'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'

const base = 'inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-none whitespace-nowrap'

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: 'border-severity-critical/40 bg-severity-critical/15 text-severity-critical',
  high: 'border-severity-high/40 bg-severity-high/15 text-severity-high',
  medium: 'border-severity-medium/40 bg-severity-medium/10 text-severity-medium',
  low: 'border-severity-low/40 bg-severity-low/10 text-severity-low',
  informational: 'border-border bg-muted text-muted-foreground',
}

export const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  informational: 'bg-severity-informational',
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span className={cn(base, SEVERITY_CLASS[severity], className)}>
      <span aria-hidden className={cn('size-1.5 rounded-full', SEVERITY_DOT[severity])} />
      {SEVERITY_LABEL[severity]}
    </span>
  )
}

const SUPPORT_CLASS: Record<SupportStatus, string> = {
  detected: 'border-primary/40 text-primary',
  supported: 'border-verified/40 text-verified',
  potential: 'border-partial/40 text-partial',
  unverified: 'border-dashed border-unverified/60 text-unverified',
}

export function SupportBadge({ status, className }: { status: SupportStatus; className?: string }) {
  return (
    <span className={cn(base, 'bg-transparent', SUPPORT_CLASS[status], className)} title={SUPPORT_DESCRIPTION[status]}>
      {SUPPORT_LABEL[status]}
    </span>
  )
}

const VERIFICATION_CLASS: Record<VerificationStatus, string> = {
  verified: 'border-verified/40 text-verified',
  partial: 'border-partial/40 text-partial',
  unverified: 'border-dashed border-unverified/60 text-unverified',
  failed: 'border-destructive/50 text-destructive',
}

export function VerificationBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  return <span className={cn(base, 'bg-transparent', VERIFICATION_CLASS[status], className)}>{VERIFICATION_LABEL[status]}</span>
}

const RELATIONSHIP_CLASS: Record<RelationshipStatus, string> = {
  chain: 'border-primary/40 bg-primary/10 text-primary',
  related: 'border-border bg-secondary text-secondary-foreground',
  isolated: 'border-border bg-transparent text-muted-foreground',
  unverified: 'border-dashed border-unverified/60 bg-transparent text-unverified',
}

export function RelationshipBadge({ relationship, className }: { relationship: RelationshipStatus; className?: string }) {
  return <span className={cn(base, RELATIONSHIP_CLASS[relationship], className)}>{RELATIONSHIP_LABEL[relationship]}</span>
}

export function SupportLevelBadge({ level }: { level: SupportLevel }) {
  const cls = { strong: 'text-verified border-verified/40', moderate: 'text-partial border-partial/40', weak: 'text-unverified border-dashed border-unverified/60' }[level]
  return <span className={cn(base, cls)}>{SUPPORT_LEVEL_LABEL[level]}</span>
}

export function ModeBadge({ mode }: { mode: 'live' | 'fixture' }) {
  if (mode === 'live') {
    return <span className={cn(base, 'border-verified/40 text-verified')}>Live analysis</span>
  }
  return <span className={cn(base, 'border-partial/50 bg-partial/10 text-partial')}>Demo Analysis · fixture data</span>
}

export function ConfidenceMeter({ value, label = 'Confidence', className }: { value: number; label?: string; className?: string }) {
  const pct = Math.round(value * 100)
  const tone = value >= 0.75 ? 'bg-verified' : value >= 0.5 ? 'bg-partial' : 'bg-unverified'
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatConfidence(value)}</span>
    </div>
  )
}

/** Inline copy button with a "copied" tick feedback. */
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, copy] = useCopyToClipboard()
  return (
    <button
      type="button"
      aria-label={label ?? `Copy ${text}`}
      onClick={() => copy(text)}
      className="inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check aria-hidden className="size-3 text-verified" /> : <Copy aria-hidden className="size-3" />}
      {copied ? 'Copied' : (label ?? text)}
    </button>
  )
}
