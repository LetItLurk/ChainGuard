import { z } from 'zod'

/**
 * Public GitHub repository URL. Only https://github.com/{owner}/{repo} forms are
 * accepted; the backend re-validates independently.
 */
export const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/

export const GithubUrlSchema = z
  .string()
  .trim()
  .min(1, 'Enter a GitHub repository URL.')
  .max(200, 'URL is too long.')
  .regex(GITHUB_URL_PATTERN, 'Use a public repository URL like https://github.com/owner/repo.')

export function parseGithubUrl(value: string): { owner: string; repo: string } | null {
  const match = GITHUB_URL_PATTERN.exec(value.trim())
  if (!match) return null
  return { owner: match[1], repo: match[2] }
}

export const ZIP_MIME_TYPES = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', '']

export function validateZipFile(file: File, maxBytes: number): string | null {
  if (!file.name.toLowerCase().endsWith('.zip')) return 'Upload a .zip archive.'
  if (!ZIP_MIME_TYPES.includes(file.type)) return 'Upload a .zip archive.'
  if (file.size === 0) return 'The uploaded archive is empty.'
  if (file.size > maxBytes) return `Archive exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`
  return null
}
