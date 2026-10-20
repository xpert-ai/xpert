// UI preferences only: isolated by host, user and runtime scope; never used for authorization.
export type RemoteViewState = Record<string, string | number | boolean | null>
const prefix = 'xpert.remote-view-state.v1:'
export function parseRemoteViewState(value: unknown): RemoteViewState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length > 40) return null
  const result: RemoteViewState = {}
  for (const [key, item] of entries) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) return null
    if (
      item === null ||
      typeof item === 'boolean' ||
      (typeof item === 'string' && item.length <= 200) ||
      (typeof item === 'number' && Number.isFinite(item))
    )
      result[key] = item
    else return null
  }
  return result
}
export function remoteViewState(identity: unknown[], state?: unknown): RemoteViewState | null {
  try {
    const key = prefix + JSON.stringify(identity)
    if (state !== undefined) {
      const parsed = parseRemoteViewState(state)
      if (parsed) sessionStorage.setItem(key, JSON.stringify(parsed))
      return parsed
    }
    return parseRemoteViewState(JSON.parse(sessionStorage.getItem(key) ?? 'null'))
  } catch {
    return null
  }
}
