const LOCAL_CHATKIT_PATH = '/chatkit'
const FRAME_URL_PARTS_PATTERN = /^([^?#]*)(\?[^#]*)?(#.*)?$/
const ABSOLUTE_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/

export function normalizeAssistantFrameUrl(frameUrl?: string | null) {
  if (!frameUrl) {
    return ''
  }

  const normalizedFrameUrl = frameUrl.trim()
  if (!normalizedFrameUrl) {
    return normalizedFrameUrl
  }

  if (ABSOLUTE_URL_PATTERN.test(normalizedFrameUrl) || normalizedFrameUrl.startsWith('//')) {
    return normalizedFrameUrl
  }

  const match = normalizedFrameUrl.match(FRAME_URL_PARTS_PATTERN)
  if (!match) {
    return normalizedFrameUrl
  }

  const [, pathname, query = '', hash = ''] = match
  if (pathname !== LOCAL_CHATKIT_PATH && pathname !== `${LOCAL_CHATKIT_PATH}/`) {
    return normalizedFrameUrl
  }

  return `${LOCAL_CHATKIT_PATH}/index.html${query}${hash}`
}
