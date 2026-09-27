'use client'

import { useCallback, useState } from 'react'

/**
 * Hook for clipboard copy with visual feedback.
 * Returns [copied, copy] — `copied` is true for 1.5s after the last copy.
 */
export function useCopyToClipboard(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    if (!navigator.clipboard) return
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [])
  return [copied, copy]
}
