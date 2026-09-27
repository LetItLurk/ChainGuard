import 'server-only'
import { DEMO_ANALYSIS } from '@/fixtures/demo/demo-analysis'
import type { Analysis } from '@/lib/domain/schemas'

const localState = globalThis as typeof globalThis & {
  __chainguardLocalState?: {
    analyses: Map<string, Analysis>
    sources: Map<string, { path: string; content: string }[]>
  }
}
const state = localState.__chainguardLocalState ??= {
  analyses: new Map<string, Analysis>(),
  sources: new Map<string, { path: string; content: string }[]>(),
}
const analyses = state.analyses
const sources = state.sources

function repositoryParts(url: string) {
  const parsed = new URL(url)
  const parts = parsed.pathname.split('/').filter(Boolean)
  return { owner: parts[0], name: parts[1]?.replace(/\.git$/, '') }
}

function now() { return new Date().toISOString() }

export async function analyzeGithubLocally(url: string): Promise<{ id: string }> {
  const { owner, name } = repositoryParts(url)
  if (!owner || !name) throw new Error('Invalid GitHub repository URL.')

  const treeResponse = await fetch(`https://api.github.com/repos/${owner}/${name}/git/trees/HEAD?recursive=1`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ChainGuard-local-analyzer' },
    cache: 'no-store',
  })
  if (!treeResponse.ok) throw new Error(`GitHub could not be read (${treeResponse.status}). Make sure the repository is public.`)
  const tree = await treeResponse.json() as { tree?: { path: string; type: string; size?: number }[] }
  const solidityPaths = (tree.tree ?? []).filter((item) => item.type === 'blob' && /\.sol$/i.test(item.path)).slice(0, 80)
  const loaded = await Promise.all(solidityPaths.slice(0, 30).map(async (item) => {
    const response = await fetch(`https://raw.githubusercontent.com/${owner}/${name}/HEAD/${item.path}`, { cache: 'no-store' })
    return response.ok ? { path: item.path, content: (await response.text()).slice(0, 250_000) } : null
  }))
  const files = loaded.filter((item): item is { path: string; content: string } => Boolean(item))
  const text = files.map((file) => file.content).join('\n')
  const contracts = (text.match(/\bcontract\s+\w+/g) ?? []).length
  const functions = (text.match(/\bfunction\s+\w+\s*\(/g) ?? []).length
  const externalCalls = (text.match(/\.call\s*\{|\.delegatecall\s*\(|\.transfer\s*\(|\.send\s*\(/g) ?? []).length
  const privileged = (text.match(/onlyOwner|onlyAdmin|onlyRole|\bowner\b/gi) ?? []).length
  const id = `local-${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
  const stamp = now()
  const analysis = structuredClone(DEMO_ANALYSIS) as Analysis
  analysis.id = id
  analysis.mode = 'live'
  analysis.status = 'complete'
  analysis.createdAt = stamp
  analysis.completedAt = stamp
  analysis.repository = {
    ...analysis.repository,
    id: `${owner}/${name}`,
    name,
    sourceType: 'github',
    sourceReference: url,
    status: 'complete',
    solidityFiles: files.map((file) => file.path),
    contractsCount: contracts,
    functionsCount: functions,
    externalCallsCount: externalCalls,
    privilegedFunctionsCount: privileged,
    oracleDependenciesCount: (text.match(/oracle|price|reserve/gi) ?? []).length,
    createdAt: stamp,
    completedAt: stamp,
  }
  analysis.staticAnalysis = { tool: 'ChainGuard local static analyzer', status: 'complete', message: 'Repository scanned locally with deterministic Solidity heuristics.' }
  analysis.aiStatus = 'skipped'
  analysis.limitations = [
    'Local mode analyzes public Solidity source without a remote backend or AI provider.',
    'Heuristic findings require manual review and are not a formal audit.',
    ...(files.length === 0 ? ['No Solidity files were found; only repository metadata was analyzed.'] : []),
  ]
  analysis.diagnostics = [{ level: 'info', stage: 'report_preparation', message: `Scanned ${files.length} Solidity file(s), ${contracts} contract(s), and ${functions} function(s) from ${owner}/${name}.` }]
  analysis.stages = analysis.stages.map((stage) => ({ ...stage, status: 'complete', startedAt: stamp, completedAt: stamp, message: stage.name === 'ai_investigation' ? 'Skipped in local mode.' : 'Completed locally.' }))
  analyses.set(id, analysis)
  sources.set(id, files)
  return { id }
}

export function getLocalAnalysis(id: string) { return analyses.get(id) ?? null }
export function getLocalSources(id: string, paths: string[]) { return (sources.get(id) ?? []).filter((source) => paths.includes(source.path)) }
export function isLocalAnalysis(id: string) { return analyses.has(id) }

export function localAnalysisErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to analyze this repository locally.'
}

