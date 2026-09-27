/**
 * Communicates the ChainGuard loop: SCAN → CONNECT → INVESTIGATE → VERIFY → BREAK
 * Each stage maps to a concrete pipeline step so the language is both product-level
 * and technically grounded.
 */

const STEPS = [
  {
    loop: 'SCAN',
    title: 'Ingest & detect',
    body: 'Repository is fetched, Solidity files discovered, and Slither detectors produce normalized findings with exact source locations.',
  },
  {
    loop: 'CONNECT',
    title: 'Map relationships',
    body: 'Contracts, call graphs, state reads/writes, oracle dependencies, and trust boundaries are built into a structured knowledge graph.',
  },
  {
    loop: 'INVESTIGATE',
    title: 'Reason across contracts',
    body: 'AI receives a bounded context package — map, findings, source excerpts — and proposes how weaknesses combine into multi-step attack paths.',
  },
  {
    loop: 'VERIFY',
    title: 'Validate every claim',
    body: 'Every referenced file, contract, function, and line range is checked against the deterministic map. Ungrounded steps are dropped.',
  },
  {
    loop: 'BREAK',
    title: 'Surface break points',
    body: 'Each chain lists the minimum code changes that interrupt its steps, grounded in the exact location where the dependency lives.',
  },
]

export function PipelineDiagram() {
  return (
    <div className="mt-10 flex flex-col gap-6">
      {/* Loop label row */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground" aria-hidden>
        {STEPS.map((step, i) => (
          <span key={step.loop} className="flex items-center gap-1.5">
            <span className={step.loop === 'BREAK' ? 'text-verified' : ''}>{step.loop}</span>
            {i < STEPS.length - 1 && <span className="text-border">→</span>}
          </span>
        ))}
      </div>

      {/* Detail grid */}
      <ol className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col gap-2 bg-background p-5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-primary">{String(i + 1).padStart(2, '0')}</span>
              <span
                className={`font-mono text-[10px] uppercase tracking-widest ${step.loop === 'BREAK' ? 'text-verified' : 'text-muted-foreground'}`}
              >
                {step.loop}
              </span>
            </div>
            <h3 className="font-medium">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}
