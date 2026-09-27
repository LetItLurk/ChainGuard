import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/chainguard/site-header'
import { AnalyzeForm } from '@/components/chainguard/analyze/analyze-form'
import { isBackendConfigured } from '@/lib/api/analysis-service'
import { getServerConfig } from '@/lib/config'

export const metadata: Metadata = { title: 'Analyze a repository' }

export default function AnalyzePage() {
  const configured = isBackendConfigured()
  const maxUploadMb = Math.round(getServerConfig().maxUploadBytes / 1024 / 1024)
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Analyze a Solidity repository</h1>
          <p className="text-muted-foreground">
            Submit a public GitHub repository or upload a ZIP archive. Source is analyzed statically in an isolated
            workspace; no project code, build scripts, or hooks are executed.
          </p>
        </div>

        <div role="status" className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          <div className="flex items-start gap-3">
            <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">Ready to analyze in local mode</p>
              <p className="text-muted-foreground">
                {configured
                  ? 'The connected ChainGuard engine will process your repository with the full pipeline.'
                  : 'No external API is required here. Submissions are validated locally and open the complete interactive report using the built-in analysis engine.'}
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-3">
            <div className="rounded border border-border/60 bg-background/40 p-3"><p className="font-medium text-foreground">1. Validate</p><p className="mt-1">Checks source type, URL, archive size, and safe file boundaries.</p></div>
            <div className="rounded border border-border/60 bg-background/40 p-3"><p className="font-medium text-foreground">2. Trace</p><p className="mt-1">Maps evidence, confidence, break points, and attack chains.</p></div>
            <div className="rounded border border-border/60 bg-background/40 p-3"><p className="font-medium text-foreground">3. Review</p><p className="mt-1">Explore findings, source evidence, mitigations, and an exportable report.</p></div>
          </div>
        </div>

        <AnalyzeForm disabled={false} maxUploadMb={maxUploadMb} />

        <section aria-labelledby="scope-heading" className="rounded-md border p-4 text-sm text-muted-foreground">
          <h2 id="scope-heading" className="mb-2 font-medium text-foreground">
            Scope of this analysis
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Reentrancy, access control, oracle and price manipulation, flash-loan surfaces, unchecked calls.</li>
            <li>Chains are potential paths from static evidence, not confirmed exploits.</li>
            <li>No result is a guarantee of safety and does not replace a professional audit.</li>
          </ul>
        </section>
      </main>
    </>
  )
}
