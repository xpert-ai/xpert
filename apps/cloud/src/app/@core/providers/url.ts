import { environment } from '../../../environments/environment'

const baseUrl = environment.API_BASE_URL
const SAME_ORIGIN_API_BASE_URLS = new Set(['same-origin', 'self', '/'])

export function normalizeApiBaseUrl(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized || normalized.startsWith('DOCKER_') || SAME_ORIGIN_API_BASE_URLS.has(normalized.toLowerCase())) {
    return ''
  }

  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

export function resolveAbsoluteApiBaseUrl(value?: string | null) {
  const normalized = normalizeApiBaseUrl(value)
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

export function resolveAbsoluteApiUrl(path: string, value?: string | null) {
  const base = resolveAbsoluteApiBaseUrl(value)
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
