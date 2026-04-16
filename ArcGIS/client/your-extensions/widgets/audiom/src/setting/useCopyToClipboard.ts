import { React } from 'jimu-core'
import { createLogger } from '../utils/logger'

const { useState, useCallback } = React
const logger = createLogger('useCopyToClipboard')

export const TOOLTIP_COPY = 'Copy to clipboard'
export const TOOLTIP_COPIED = 'Copied!'

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
