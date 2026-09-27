import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-medium tracking-tight">
      <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-primary" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z" />
        <circle cx="9" cy="10" r="1.6" />
        <circle cx="15" cy="14" r="1.6" />
        <path d="m10.3 11 3.4 2" />
      </svg>
      <span>ChainGuard</span>
    </Link>
  )
}

export function SiteHeader() {
  return (
    <header className="print-hidden border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/analyses/demo">Demo Analysis</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/analyze">Analyze repository</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
