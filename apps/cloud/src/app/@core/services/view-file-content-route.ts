/** Only resolve the expected grant on the configured API; never send authentication to a grant's host. */
export function viewFileContentRoute(grantUrl: string, sessionId: string, apiPrefix: string): string {
  const base = new URL(`${apiPrefix}/`, window.location.origin)
  const target = new URL(grantUrl, base)
  const prefix = `${base.pathname}workspace-files/content/`
  if (
    target.origin !== base.origin ||
    !target.pathname.startsWith(prefix) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash
  ) {
    throw new Error('Invalid workspace file access URL')
  }
  const parts = target.pathname.slice(prefix.length).split('/')
  if (
    parts.length !== 3 ||
    parts.some((part) => {
      const decoded = decodeURIComponent(part)
      return !decoded || decoded === '.' || decoded === '..' || /[/\\\u0000-\u001f\u007f]/.test(decoded)
    }) ||
    decodeURIComponent(parts[0]) !== sessionId
  ) {
    throw new Error('Invalid workspace file access URL')
  }
  return `/view-sessions/${parts[0]}/grants/${parts[1]}/content/${parts[2]}`
}
