import { environment } from '../../../environments/environment'

const baseUrl = environment.API_BASE_URL

/**
 * Inject the base url of api server
 * 
 * @returns url
 */
export function injectApiBaseUrl() {
  if (!baseUrl) {
    return ''
  }
  return baseUrl?.endsWith('/') ? baseUrl.slice(0, baseUrl.length - 1) : baseUrl
}
