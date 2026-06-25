export function resolveTenantFromHostname(hostname: string): string | null {
  const host = hostname.trim()
  const normalizedHost = host.toLowerCase()

  if (!host || normalizedHost === 'localhost' || isIPv4Hostname(normalizedHost)) {
    return null
  }

  const parts = host.split('.')
  // e.g. foo.app.xpertai.cn => ['foo','app','xpertai','cn']
  if (parts.length >= 4 && parts[1]?.toLowerCase() === 'app') {
    const sub = parts[0]
    if (sub && sub.toLowerCase() !== 'app') {
      return sub
    }
  }

  return null
}

function isIPv4Hostname(hostname: string) {
  const parts = hostname.split('.')

  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d+$/.test(part)) {
        return false
      }

      const value = Number(part)
      return value >= 0 && value <= 255
    })
  )
}
