import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SiteHeader } from '@/components/chainguard/site-header'
import { PipelineDiagram } from '@/components/chainguard/landing/pipeline-diagram'
import { ChainPreview } from '@/components/chainguard/landing/chain-preview'
import { DEMO_ANALYSIS } from '@/fixtures/demo/demo-analysis'

export default function HomePage() {
  const chain = DEMO_ANALYSIS.attackChains[0]
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:py-24">
          <div className="flex flex-col gap-6">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              Solidity attack-chain analysis
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              From vulnerabilities to attack chains.
            </h1>
            <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Investigate how smart-contract weaknesses connect, verify the evidence behind each
              step, and identify where to break the chain.
            </p>

            {/* ChainGuard Loop */}
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
              {(['SCAN', 'CONNECT', 'INVESTIGATE', 'VERIFY', 'BREAK'] as const).map(
                (label, i, arr) => (
                  <span key={label} className="flex items-center gap-1.5">
                    <span
                      className={
                        label === 'BREAK' ? 'text-verified' : 'text-muted-foreground/80'
                      }
                    >
                      {label}
                    </span>
                    {i < arr.length - 1 && (
                      <span aria-hidden className="text-border">
                        →
                      </span>
                    )}
                  </span>
                ),
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/analyze">
                  Analyze repository
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/analyses/demo">View demo</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              The demo uses a fixture repository with pre-recorded results. It is clearly labelled
              throughout.
            </p>
          </div>
          <ChainPreview chain={chain} />
        </section>

        {/* From flat findings to investigation */}
        <section aria-labelledby="diff-heading" className="border-t bg-muted/20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-2">
            <div className="flex flex-col gap-4">
              <h2 id="diff-heading" className="text-sm font-mono uppercase tracking-widest text-muted-foreground">
                Traditional scanner
              </h2>
              <div className="flex flex-col gap-2 rounded-md border bg-card p-5">
                {[
                  { label: 'Reentrancy warning', sev: 'high' },
                  { label: 'Access-control warning', sev: 'high' },
                  { label: 'Oracle warning', sev: 'medium' },
                  { label: 'External-call warning', sev: 'medium' },
                ].map(({ label }) => (
                  <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    {label}
                  </div>
                ))}
                <p className="mt-2 font-mono text-xs text-muted-foreground">4 disconnected findings</p>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-mono uppercase tracking-widest text-primary">
                ChainGuard investigation
              </h2>
              <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-card p-5">
                <p className="text-xs text-muted-foreground">4 potential findings</p>
                <p className="text-xs text-muted-foreground">3 relationships identified</p>
                <div className="my-1 border-t" />
                <p className="text-sm font-medium text-primary">1 potential attack chain</p>
                <p className="text-xs text-muted-foreground">
                  Reentrancy + oracle + access-control → cross-contract drain
                </p>
                <div className="my-1 border-t" />
                <p className="text-xs text-muted-foreground">evidence-backed · 2 break points</p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-heading" className="border-t">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
              Evidence first, reasoning second
            </h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              AI reasoning is never the source of truth. Candidate chains are validated against the
              deterministic repository map before they reach you.
            </p>
            <PipelineDiagram />
          </div>
        </section>

        {/* Responsible limits */}
        <section aria-labelledby="limits-heading" className="border-t">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
            <h2 id="limits-heading" className="text-2xl font-semibold tracking-tight">
              What ChainGuard does not claim
            </h2>
            <ul className="flex flex-col gap-4 text-muted-foreground md:col-span-2">
              <li>
                <span className="font-medium text-foreground">No confirmed exploits.</span> Chains
                are potential paths derived from static evidence. ChainGuard does not execute
                transactions.
              </li>
              <li>
                <span className="font-medium text-foreground">No safety guarantee.</span> An empty
                result is not proof of security and does not replace a professional audit.
              </li>
              <li>
                <span className="font-medium text-foreground">Clear uncertainty.</span> Claims that
                cannot be validated against the repository are marked Unverified and kept separate.
              </li>
            </ul>
          </div>
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-muted-foreground sm:px-6">
          ChainGuard supports security review. It is not a substitute for a professional audit.
        </div>
      </footer>
    </>
  )
}
