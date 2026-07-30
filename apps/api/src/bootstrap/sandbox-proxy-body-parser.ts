import type { IncomingMessage } from 'node:http'

const SANDBOX_PREVIEW_PROXY_PATH = /(?:^|\/)sandbox\/conversations\/[^/]+\/services\/[^/]+\/proxy(?:\/|$)/

function getRequestPath(request: IncomingMessage): string {
  return (request.url ?? '').split('?', 1)[0]
}

function getMediaType(request: IncomingMessage): string {
  const contentType = request.headers['content-type']
  const value = Array.isArray(contentType) ? contentType[0] : contentType
  return value?.split(';', 1)[0].trim().toLowerCase() ?? ''
}

export function isSandboxPreviewProxyRequest(request: IncomingMessage): boolean {
  return SANDBOX_PREVIEW_PROXY_PATH.test(getRequestPath(request))
}

export function createSandboxAwareBodyParserType(mediaType: string): (request: IncomingMessage) => boolean {
  const normalizedMediaType = mediaType.toLowerCase()
  return (request) => !isSandboxPreviewProxyRequest(request) && getMediaType(request) === normalizedMediaType
}
