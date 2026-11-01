import { AppPlatformStatus } from '@xpert-ai/contracts'

/** Resume only an assigned business route; the route guard still authorizes its resources. */
export function applicationReturnUrl(url: string | null, status: AppPlatformStatus): string | null {
  if (!url || !url.startsWith('/') || url.startsWith('//') || /[\\\r\n]/.test(url)) return null
  const pathname = url.split('?')[0]
  if (pathname === '/project' || /^\/project\/[0-9a-f-]{36}$/.test(pathname)) return url
  const assigned = status.apps
    .flatMap((app) => app.entries)
    .some((entry) => {
      const base = `/chat/x/${encodeURIComponent(entry.slug || entry.id)}`
      return pathname === base || pathname.startsWith(`${base}/`)
    })
  return assigned ? url : null
}
