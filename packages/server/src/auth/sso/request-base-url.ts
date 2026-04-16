import { Request } from 'express'
import { getFirstHeaderValue, resolveRequestHost } from '../../core/context/tenant-domain.utils'

export function resolveRequestBaseUrl(request: Request): string {
  const protocol =
    getFirstHeaderValue(request.headers['x-forwarded-proto'])
      ?.split(',')
      .map((part) => part.trim())
      .find(Boolean) ??
    request.protocol ??
    'http'
  const host = resolveRequestHost(request)

  return host ? `${protocol}://${host}` : ''
}
