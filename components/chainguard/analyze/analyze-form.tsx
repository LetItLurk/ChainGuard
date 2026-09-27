'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileArchive, GitBranch as Github, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GithubUrlSchema } from '@/lib/validation/repository-input'

type Source = 'github' | 'zip'

export function AnalyzeForm({ disabled, maxUploadMb }: { disabled: boolean; maxUploadMb: number }) {
  const router = useRouter()
  const [source, setSource] = useState<Source>('github')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const urlId = useId()
  const fileId = useId()
  const errorId = useId()

  function validate(): string | null {
    if (source === 'github') {
      const result = GithubUrlSchema.safeParse(url)
      return result.success ? null : (result.error.issues[0]?.message ?? 'Invalid URL.')
    }
    if (!file) return 'Choose a .zip archive to upload.'
    if (!file.name.toLowerCase().endsWith('.zip')) return 'Upload a .zip archive.'
    if (file.size > maxUploadMb * 1024 * 1024) return `Archive exceeds the ${maxUploadMb} MB limit.`
    return null
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = validate()
    setError(problem)
    if (problem) return

    const body = new FormData()
    body.set('sourceType', source)
    if (source === 'github') body.set('githubUrl', url.trim())
    else if (file) body.set('file', file)

    startTransition(async () => {
      try {
        const response = await fetch('/api/analyses', { method: 'POST', body })
        const payload = (await response.json().catch(() => ({}))) as { id?: string; detail?: string }
        if (!response.ok || !payload.id) {
          setError(payload.detail ?? 'Unable to start the analysis.')
          return
        }
        router.push(`/analyses/${payload.id}`)
      } catch {
        setError('Network error. Check your connection and try again.')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-md border bg-card p-5" aria-describedby={error ? errorId : undefined}>
      <Tabs value={source} onValueChange={(v: string) => { setSource(v as Source); setError(null) }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="github" disabled={disabled}>
            <Github aria-hidden /> GitHub URL
          </TabsTrigger>
          <TabsTrigger value="zip" disabled={disabled}>
            <FileArchive aria-hidden /> ZIP upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="github" className="mt-4 flex flex-col gap-2">
          <label htmlFor={urlId} className="text-sm font-medium">
            Public repository URL
          </label>
          <input
            id={urlId}
            name="githubUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://github.com/owner/repo"
            value={url}
            disabled={disabled || pending}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={Boolean(error) && source === 'github'}
            className="h-10 rounded-md border bg-background px-3 font-mono text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">The default branch is fetched as an archive. Private repositories are not supported.</p>
        </TabsContent>

        <TabsContent value="zip" className="mt-4 flex flex-col gap-2">
          <label htmlFor={fileId} className="text-sm font-medium">
            Repository archive
          </label>
          <input
            id={fileId}
            name="file"
            type="file"
            accept=".zip,application/zip"
            disabled={disabled || pending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-invalid={Boolean(error) && source === 'zip'}
            className="rounded-md border bg-background p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Up to {maxUploadMb} MB. Archives are extracted with path-traversal, symlink, and size checks.
          </p>
        </TabsContent>
      </Tabs>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" disabled={disabled || pending} className="self-start">
        {pending && <Loader2 aria-hidden className="animate-spin" />}
        {pending ? 'Starting analysis' : 'Start analysis'}
      </Button>
    </form>
  )
}
