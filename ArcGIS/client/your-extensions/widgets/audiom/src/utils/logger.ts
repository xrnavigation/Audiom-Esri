/**
 * Development-only logger utility for the Audiom widget.
 * Logs are only output when running in Experience Builder's builder mode.
 * In production/runtime mode, all logging is suppressed.
 */

import { getAppStore } from 'jimu-core'

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error'
}

const LOG_PREFIX = '[Audiom]'

/**
 * Check if we're in builder/development mode.
 * Uses Jimu's app store to determine the current mode.
 */
function isDevMode(): boolean {
  try {
    const appStore = getAppStore()
    const state = appStore?.getState()
    // In builder mode, appContext.isInBuilder is true
    return state?.appContext?.isInBuilder === true
  } catch {
    // If we can't access the store, assume production
    return false
  }
}

/**
 * Internal log function that respects dev mode.
 */
function logInternal(level: LogLevel, context: string, ...args: unknown[]): void {
  if (!isDevMode()) {
    return
  }

  const prefix = context ? `${LOG_PREFIX}[${context}]` : LOG_PREFIX

  switch (level) {
    case LogLevel.Debug:
      console.debug(prefix, ...args)
      break
    case LogLevel.Info:
      console.info(prefix, ...args)
      break
    case LogLevel.Warn:
      console.warn(prefix, ...args)
      break
    case LogLevel.Error:
      console.error(prefix, ...args)
      break
  }
}

/**
 * Logger interface for a specific context.
 */
export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * Creates a logger instance for a specific context/module.
 * All logs are prefixed with [Audiom][context] for easy filtering.
 * 
 * @param context - The module/component name for log prefixing
 * @returns Logger instance with debug, info, warn, and error methods
 * 
 * @example
 * const logger = createLogger('MapSyncManager')
 * logger.debug('Attached to map', mapId)
 * logger.warn('No map view available')
 */
export function createLogger(context: string): Logger {
  return {
    debug: (...args: unknown[]) => logInternal(LogLevel.Debug, context, ...args),
    info: (...args: unknown[]) => logInternal(LogLevel.Info, context, ...args),
    warn: (...args: unknown[]) => logInternal(LogLevel.Warn, context, ...args),
    error: (...args: unknown[]) => logInternal(LogLevel.Error, context, ...args)
  }
}

/**
 * Default logger without a specific context.
 * Use createLogger() for module-specific logging.
 */
export const logger: Logger = createLogger('')
