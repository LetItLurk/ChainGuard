'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

export function AnalysisNav({
  id,
  disabled,
  counts,
}: {
  id: string
  disabled: boolean
  counts: { chains: number; findings: number }
}) {
  const pathname = usePathname()
  const base = `/analyses/${id}`
  const items = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/chains`, label: 'Attack chains', count: counts.chains },
    { href: `${base}/findings`, label: 'Findings', count: counts.findings },
    { href: `${base}/report`, label: 'Report' },
  ]
  return (
    <nav aria-label="Analysis sections" className="-mb-px flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const isDisabled = disabled && !item.exact
        return (
          <Link
            key={item.href}
            href={isDisabled ? base : item.href}
            aria-current={active ? 'page' : undefined}
            aria-disabled={isDisabled || undefined}
            tabIndex={isDisabled ? -1 : undefined}
            className={cn(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
              active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              isDisabled && 'pointer-events-none opacity-40',
            )}
          >
            {item.label}
            {item.count !== undefined && !disabled && (
              <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                {item.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
