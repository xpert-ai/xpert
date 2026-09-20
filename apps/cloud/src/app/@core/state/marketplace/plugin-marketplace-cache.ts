import { concat, defer, finalize, Observable, of, shareReplay, tap } from 'rxjs'
import type { PluginMarketplaceResponse } from '@xpert-ai/contracts'

/** Scope keys include user, tenant, organization and filters. Never share a private catalog across scopes. */
export class PluginMarketplaceCache {
  private readonly snapshots = new Map<string, { value: PluginMarketplaceResponse; expiresAt: number }>()
  private readonly requests = new Map<string, Observable<PluginMarketplaceResponse>>()

  get(key: string, load: () => Observable<PluginMarketplaceResponse>) {
    return defer(() => {
      let request = this.requests.get(key)
      if (!request) {
        request = load().pipe(
          tap((value) => {
            this.snapshots.delete(key)
            this.snapshots.set(key, { value, expiresAt: Date.now() + 300_000 })
            while (this.snapshots.size > 12) {
              this.snapshots.delete(this.snapshots.keys().next().value)
            }
          }),
          finalize(() => this.requests.delete(key)),
          shareReplay({ bufferSize: 1, refCount: true })
        )
        this.requests.set(key, request)
      }
      const snapshot = this.snapshots.get(key)
      return snapshot && snapshot.expiresAt > Date.now() ? concat(of(snapshot.value), request) : request
    })
  }
}
