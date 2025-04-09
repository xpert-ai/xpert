import debug from 'debug'
import { Exception } from './xmla/types'

export const log = debug('ocap:xmla')

/**
 * Get error message text tentatively
 *
 * @todo Is there a better way ?
 *
 * @param err
 * @returns
 */
export function getErrorMessage(err: any): string {
  let error: string
  if (typeof err === 'string') {
    error = err
  } else if (err instanceof Error) {
    error = err?.message
  } else if (err?.error instanceof Error) {
    error = err?.error?.message
  } else if (typeof err?.error === 'string') {
    error = err.error
  } else {
    error = err
  }

  return error
}

export function getExceptionMessage(exception: Exception) {
  return typeof exception.data?.error === 'string' ? exception.data.error : exception.message
}

/**
 * Simplify error messages
 *
 * @param message
 * @returns
 */
export function simplifyErrorMessage(message: string): string {
  return typeof message === 'string'
    ? message.trim().replace(/^00[A-Z0-9]{5,6}\s*The Mondrian XML: (Mondrian Error:)?/g, '')
    : message
}
