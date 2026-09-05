import { DOCUMENT, Injectable, inject, signal, untracked } from '@angular/core'

/** Browser-local workspace history, isolated by user and organization scope. */
@Injectable({ providedIn: 'root' })
export class WorkspaceHistoryService {
  readonly #document = inject(DOCUMENT)
  readonly #revision = signal(0)
  readonly #cache = new Map<string, string[]>()

  recent(userId: string | null | undefined, organizationId: string | null | undefined): string[] {
    this.#revision()
    if (!userId) return []
    const key = this.key(userId, organizationId)
    if (!this.#cache.has(key)) this.#cache.set(key, this.read(key))
    return this.#cache.get(key) ?? []
  }

  remember(userId: string | null | undefined, organizationId: string | null | undefined, workspaceId: string) {
    if (!userId || !workspaceId) return
    const previous = untracked(() => this.recent(userId, organizationId))
    if (previous[0] === workspaceId) return
    const ids = [workspaceId, ...previous.filter((id) => id !== workspaceId)].slice(0, 50)
    const key = this.key(userId, organizationId)
    this.#cache.set(key, ids)
    try {
      this.#document.defaultView?.localStorage.setItem(key, JSON.stringify(ids))
    } catch {
      // Keep the in-memory history when browser storage is unavailable.
    }
    this.#revision.update((revision) => revision + 1)
  }

  private key(userId: string, organizationId: string | null | undefined) {
    return `xpert.workspace-history.v1:${userId}:${organizationId ?? 'tenant'}`
  }

  private read(key: string): string[] {
    try {
      const value: unknown = JSON.parse(this.#document.defaultView?.localStorage.getItem(key) ?? '[]')
      return Array.isArray(value)
        ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && !!id.trim()))).slice(0, 50)
        : []
    } catch {
      return []
    }
  }
}
