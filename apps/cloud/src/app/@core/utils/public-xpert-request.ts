export function isPublicXpertRequest(method: string, url: string): boolean {
  try {
    const normalizedMethod = method.toUpperCase()
    const pathname = new URL(url, 'http://localhost').pathname
    const segments = pathname.split('/').filter(Boolean)

    if (segments[0] !== 'api' || segments[1] !== 'xpert' || !segments[2]) {
      return false
    }

    switch (segments[3]) {
      case 'app':
        return normalizedMethod === 'GET' && segments.length === 4
      case 'chat-app':
        return normalizedMethod === 'POST' && segments.length === 4
      case 'conversation':
        if (segments.length === 4) {
          return normalizedMethod === 'GET'
        }

        if (segments.length === 5) {
          return normalizedMethod === 'GET' || normalizedMethod === 'PUT' || normalizedMethod === 'DELETE'
        }

        return normalizedMethod === 'GET' && segments.length === 6 && segments[5] === 'feedbacks'
      default:
        return false
    }
  } catch {
    return false
  }
}
