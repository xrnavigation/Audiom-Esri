import { React } from 'jimu-core'
import { createLogger } from '../utils/logger'

const { useState, useCallback } = React
const logger = createLogger('useCopyToClipboard')

// Re-exported for backward compatibility — the canonical home is now strings.ts
export { TOOLTIP_COPY, TOOLTIP_COPIED } from './strings'

const DEFAULT_RESET_DELAY = 1000

/**
 * Hook that encapsulates the copy-to-clipboard pattern:
 * copied state, clipboard write, auto-reset timer, and error logging.
 */
export function useCopyToClipboard(resetDelay: number = DEFAULT_RESET_DELAY) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetDelay)
    } catch (err) {
      logger.error('Failed to copy to clipboard:', err)
    }
  }, [resetDelay])

  return { copied, copyToClipboard }
}
