import { Subject } from 'rxjs'

export const CURRENT_USER_SESSION_CACHE_PREFIX = 'current-user-feature-context:'
export const currentUserDisplayCacheInvalidated$ = new Subject<void>()
let epoch = 0

export function invalidateCurrentUserDisplayCache() {
  clearCurrentUserSessionCache()
  currentUserDisplayCacheInvalidated$.next()
}

export function currentUserSessionEpoch() {
  return epoch
}

export function clearCurrentUserSessionCache() {
  epoch++
  try {
    const storage = globalThis.sessionStorage
    if (!storage) return
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index)
      if (key?.startsWith(CURRENT_USER_SESSION_CACHE_PREFIX)) storage.removeItem(key)
    }
  } catch {
    // Storage may be unavailable; the epoch still rejects responses from the old login session.
  }
}
