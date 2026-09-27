import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function ServiceUnavailable({ message }: { message: string }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-20 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">ChainGuard runtime</p>
        <h1 className="text-2xl font-semibold tracking-tight">Live analysis is not available</h1>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <div className="grid w-full gap-3 rounded-md border bg-muted/20 p-4 text-sm">
        <div className="flex items-start gap-3">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-partial" aria-hidden />
          <div><p className="font-medium text-foreground">Backend connection required</p><p className="text-muted-foreground">This deployment cannot reach a ChainGuard API endpoint for this analysis.</p></div>
        </div>
        <div className="flex items-start gap-3">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-verified" aria-hidden />
          <div><p className="font-medium text-foreground">Demo mode remains available</p><p className="text-muted-foreground">Explore the full report workflow with clearly labelled fixture data.</p></div>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/analyze">Start a new analysis</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/analyses/demo">Open Demo Analysis</Link>
        </Button>
      </div>
    </main>
  )
}
