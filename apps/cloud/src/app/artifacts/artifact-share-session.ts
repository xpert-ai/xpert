import { API_PREFIX } from '@xpert-ai/cloud/state'

export const ARTIFACT_SHARE_SESSION_HTTP_OPTIONS = {
  withCredentials: true
} as const

/**
 * Keep the handshake on the Artifact public origin so its host-only cookie is
 * sent to the fixed `/artifacts/share/:slug` URL after the hard redirect.
 */
export function artifactShareSessionUrl(artifactLinkSlug?: string) {
  const suffix = artifactLinkSlug ? `/${encodeURIComponent(artifactLinkSlug)}` : ''
  const path = `${API_PREFIX}/artifacts/share-session${suffix}`

  return typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString()
}
