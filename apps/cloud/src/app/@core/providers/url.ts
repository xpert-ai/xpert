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

/**
 * Inject the base url of api server
 * 
 * @returns url
 */
export function injectApiBaseUrl() {
  return normalizeApiBaseUrl(baseUrl)
}
