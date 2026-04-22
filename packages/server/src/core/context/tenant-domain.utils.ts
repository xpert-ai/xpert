import { Request } from 'express'

function normalizeHeaderValue(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .find(Boolean)
}

export function getFirstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => item?.trim()).find(Boolean)
  }
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function parseHostValue(value: string | undefined, selector: (url: URL) => string): string | undefined {
  const normalized = value ? normalizeHeaderValue(value) : undefined
  if (!normalized) {
    return undefined
  }

  try {
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      return selector(new URL(normalized))
    }
    return selector(new URL(`http://${normalized}`))
  } catch {
    return undefined
  }
}

export function resolveRequestHost(request: Request): string | undefined {
  return (
    parseHostValue(getFirstHeaderValue(request.headers['x-forwarded-host']), (url) => url.host) ??
    parseHostValue(getFirstHeaderValue(request.headers.host), (url) => url.host) ??
    parseHostValue(getFirstHeaderValue(request.headers.origin), (url) => url.host)
  )
}

export function resolveRequestHostname(request: Request): string | undefined {
  return (
    parseHostValue(getFirstHeaderValue(request.headers['x-forwarded-host']), (url) => url.hostname) ??
    parseHostValue(getFirstHeaderValue(request.headers.host), (url) => url.hostname) ??
    parseHostValue(getFirstHeaderValue(request.headers.origin), (url) => url.hostname)
  )
}

export function extractTenantDomainFromHostname(hostname: string | undefined): string | null {
  if (!hostname) {
    return null
  }

  const normalized = hostname.trim().toLowerCase()
  if (!normalized || normalized === 'localhost') {
    return null
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized) || normalized.includes(':')) {
    return null
  }

  const parts = normalized.split('.').filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  return parts[0] || null
}

export function resolveTenantDomainFromRequest(request: Request): string | null {
  return extractTenantDomainFromHostname(resolveRequestHostname(request))
}

export function getNormalizedRequestPath(request: Request): string {
  const rawPath = request.originalUrl || request.url || request.path || '/'
  const pathWithoutQuery = rawPath.split('?')[0] || '/'
  const normalized = pathWithoutQuery.replace(/\/+$/, '')
  return normalized || '/'
}
