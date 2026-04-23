export function isPublicXpertRequestUrl(url: string): boolean {
  try {
    const pathname = new URL(url, 'http://localhost').pathname
    const segments = pathname.split('/').filter(Boolean)

    if (segments[0] !== 'api' || segments[1] !== 'xpert' || !segments[2]) {
      return false
    }

    return segments[3] === 'app' || segments[3] === 'chat-app' || segments[3] === 'conversation'
  } catch {
    return false
  }
}
