import { environment } from '../../../environments/environment'
import { resolveTenantFromHostname } from '../services/tenant-hostname'

const baseUrl = environment.API_BASE_URL
const SAME_ORIGIN_API_BASE_URLS = new Set(['same-origin', 'self', '/'])
const TENANT_API_BASE_URL_TOKEN = '{tenant}'

export function normalizeApiBaseUrl(value?: string | null, hostname = getCurrentHostname()) {
  const normalized = value?.trim()
  if (!normalized || normalized.startsWith('DOCKER_') || SAME_ORIGIN_API_BASE_URLS.has(normalized.toLowerCase())) {
    return ''
  }

  const resolved = resolveTenantApiBaseUrl(normalized, hostname)
  return resolved.endsWith('/') ? resolved.slice(0, -1) : resolved
}

export function resolveAbsoluteApiBaseUrl(value?: string | null, hostname = getCurrentHostname()) {
  const normalized = normalizeApiBaseUrl(value, hostname)
  if (!normalized) {
    return getCurrentOrigin()
  }

  if (normalized.startsWith('//')) {
    return `${getCurrentProtocol()}${normalized}`
  }

  if (normalized.startsWith('/')) {
    return `${getCurrentOrigin()}${normalized}`
  }

  return normalized
}

export function resolveAbsoluteApiUrl(path: string, value?: string | null, hostname = getCurrentHostname()) {
  const base = resolveAbsoluteApiBaseUrl(value, hostname)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}

/**
 * Inject the base url of api server
 * 
 * @returns url
 */
export function injectApiBaseUrl() {
  return normalizeApiBaseUrl(baseUrl)
}

function getCurrentOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function getCurrentProtocol() {
  return typeof window === 'undefined' ? 'https:' : window.location.protocol
}

function getCurrentHostname() {
  return typeof window === 'undefined' ? '' : window.location.hostname
}

export function resolveTenantApiBaseUrl(value: string, hostname = getCurrentHostname()) {
  if (!value.includes(TENANT_API_BASE_URL_TOKEN)) {
    return value
  }

  const tenantDomain = resolveTenantFromHostname(hostname)
  if (tenantDomain) {
    return value.split(TENANT_API_BASE_URL_TOKEN).join(tenantDomain)
  }

  return value.split(`${TENANT_API_BASE_URL_TOKEN}.`).join('').split(TENANT_API_BASE_URL_TOKEN).join('')
}
