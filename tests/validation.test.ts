/**
 * Repository input validation tests.
 *
 * Covers both the GitHub URL schema and ZIP file validation helper used by
 * the /api/analyses route before anything reaches the backend.
 */

import { describe, it, expect } from 'vitest'
import { GithubUrlSchema, validateZipFile } from '@/lib/validation/repository-input'

// ---------------------------------------------------------------------------
// GitHub URL schema
// ---------------------------------------------------------------------------
describe('GithubUrlSchema', () => {
  const valid = [
    'https://github.com/OpenZeppelin/openzeppelin-contracts',
    'https://github.com/uniswap/v3-core',
    'https://github.com/a/b',
    'https://github.com/owner/repo.git',
    'https://github.com/owner/repo/',
    'https://github.com/my-org/my.repo_1',
  ]

  const invalid = [
    '',
    'not-a-url',
    'http://github.com/owner/repo',       // http not https
    'https://gitlab.com/owner/repo',       // not github.com
    'https://github.com/',                 // no owner
    'https://github.com/owner',            // no repo
    'https://github.com/own er/repo',      // space in owner
    'a'.repeat(201),                       // too long
  ]

  for (const url of valid) {
    it(`accepts: ${url}`, () => {
      expect(GithubUrlSchema.safeParse(url).success).toBe(true)
    })
  }

  for (const url of invalid) {
    it(`rejects: ${url.slice(0, 50) || '(empty string)'}`, () => {
      expect(GithubUrlSchema.safeParse(url).success).toBe(false)
    })
  }
})

// ---------------------------------------------------------------------------
// ZIP file validation
// ---------------------------------------------------------------------------
describe('validateZipFile', () => {
  const MAX = 20 * 1024 * 1024 // 20 MB

  function makeFile(name: string, size: number, type = 'application/zip'): File {
    const bytes = new Uint8Array(size)
    return new File([bytes], name, { type })
  }

  it('accepts a valid ZIP file', () => {
    const file = makeFile('repo.zip', 1024)
    expect(validateZipFile(file, MAX)).toBeNull()
  })

  it('rejects a non-zip extension', () => {
    const file = makeFile('repo.tar.gz', 1024)
    expect(validateZipFile(file, MAX)).toBeTruthy()
  })

  it('rejects an empty file', () => {
    const file = makeFile('repo.zip', 0)
    expect(validateZipFile(file, MAX)).toBeTruthy()
  })

  it('rejects a file exceeding the size limit', () => {
    const file = makeFile('repo.zip', MAX + 1)
    expect(validateZipFile(file, MAX)).toBeTruthy()
  })

  it('accepts a file exactly at the limit', () => {
    const file = makeFile('repo.zip', MAX)
    expect(validateZipFile(file, MAX)).toBeNull()
  })

  it('accepts application/octet-stream MIME type', () => {
    const file = makeFile('repo.zip', 1024, 'application/octet-stream')
    expect(validateZipFile(file, MAX)).toBeNull()
  })

  it('accepts empty MIME type (some browsers omit it)', () => {
    const file = makeFile('repo.zip', 1024, '')
    expect(validateZipFile(file, MAX)).toBeNull()
  })
})
