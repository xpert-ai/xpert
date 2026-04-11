import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cache } from 'cache-manager'
import { createHash } from 'crypto'
import { XpertExtensionViewManifest, XpertResolvedViewHostContext, XpertViewDataResult, XpertViewQuery } from '@xpert-ai/contracts'
import { StrategyBus } from '@xpert-ai/plugin-sdk'

export interface XpertViewCacheHostIdentity {
  tenantId: string
  organizationId?: string | null
  hostType: string
  hostId: string
}

@Injectable()
export class ViewExtensionCacheService implements OnModuleInit {
  private readonly logger = new Logger(ViewExtensionCacheService.name)
  private readonly trackedKeys = new Set<string>()
  private readonly hostKeys = new Map<string, Set<string>>()
  private readonly hostIdentityKeys = new Map<string, Set<string>>()
  private readonly viewKeys = new Map<string, Set<string>>()
  private readonly viewIdentityKeys = new Map<string, Set<string>>()

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly strategyBus: StrategyBus
  ) {}

  onModuleInit() {
    this.strategyBus.events$.subscribe(() => {
      void this.clearAll()
    })
  }

  async getOrSetSlotViews(
    context: XpertResolvedViewHostContext,
    slot: string,
    ttlMs: number,
    loader: () => Promise<XpertExtensionViewManifest[]>
  ) {
    const cacheKey = this.getManifestCacheKey(context, slot)
    const cached = await this.cacheManager.get<XpertExtensionViewManifest[]>(cacheKey)
    if (cached) {
      return cached
    }

    const value = await loader()
    await this.cacheManager.set(cacheKey, value, ttlMs)
    this.trackKey(context, cacheKey)
    return value
  }

  async getOrSetViewData(
    context: XpertResolvedViewHostContext,
    viewKey: string,
    query: XpertViewQuery,
    ttlMs: number,
    loader: () => Promise<XpertViewDataResult>
  ) {
    const cacheKey = this.getDataCacheKey(context, viewKey, query)
    const cached = await this.cacheManager.get<XpertViewDataResult>(cacheKey)
    if (cached) {
      return cached
    }

    const value = await loader()
    await this.cacheManager.set(cacheKey, value, ttlMs)
    this.trackKey(context, cacheKey, viewKey)
    return value
  }

  async invalidateHost(context: XpertResolvedViewHostContext) {
    await this.invalidateHostIdentity({
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      hostType: context.hostType,
      hostId: context.hostId
    })
  }

  async invalidateHostIdentity(identity: XpertViewCacheHostIdentity) {
    const hostIdentityKey = this.getHostIdentityKey(identity)
    const keys = this.hostIdentityKeys.get(hostIdentityKey)
    if (!keys) {
      return
    }

    await Promise.all(Array.from(keys).map((key) => this.deleteKey(key)))
    this.hostIdentityKeys.delete(hostIdentityKey)
  }

  async invalidateView(context: XpertResolvedViewHostContext, viewKey: string) {
    const viewIdentityKey = this.getViewIdentityKey(context, viewKey)
    const keys = this.viewIdentityKeys.get(viewIdentityKey)
    if (keys) {
      await Promise.all(Array.from(keys).map((key) => this.deleteKey(key)))
      this.viewIdentityKeys.delete(viewIdentityKey)
    }

    const hostIdentityKey = this.getHostIdentityKey(context)
    const hostKeys = this.hostIdentityKeys.get(hostIdentityKey)
    if (!hostKeys) {
      return
    }

    const manifestKeys = Array.from(hostKeys).filter((key) => key.includes(':slot:'))
    await Promise.all(manifestKeys.map((key) => this.deleteKey(key)))
  }

  async clearAll() {
    const keys = Array.from(this.trackedKeys)
    await Promise.all(keys.map((key) => this.deleteKey(key)))
    this.hostKeys.clear()
    this.hostIdentityKeys.clear()
    this.viewKeys.clear()
    this.viewIdentityKeys.clear()
    this.logger.debug('Cleared view extension cache entries')
  }

  private getManifestCacheKey(context: XpertResolvedViewHostContext, slot: string) {
    return `view-extension:${this.getHostScopeKey(context)}:slot:${slot}`
  }

  private getDataCacheKey(context: XpertResolvedViewHostContext, viewKey: string, query: XpertViewQuery) {
    const queryHash = createHash('sha1').update(this.normalizeQuery(query)).digest('hex')
    return `view-extension:${this.getHostScopeKey(context)}:view:${viewKey}:${queryHash}`
  }

  private getHostScopeKey(context: XpertResolvedViewHostContext) {
    return [
      context.tenantId,
      context.organizationId ?? 'tenant',
      context.userId,
      context.hostType,
      context.hostId
    ].join(':')
  }

  private getViewScopeKey(context: XpertResolvedViewHostContext, viewKey: string) {
    return `${this.getHostScopeKey(context)}:${viewKey}`
  }

  private getViewIdentityKey(identity: XpertViewCacheHostIdentity, viewKey: string) {
    return `${this.getHostIdentityKey(identity)}:${viewKey}`
  }

  private getHostIdentityKey(identity: XpertViewCacheHostIdentity) {
    return [identity.tenantId, identity.organizationId ?? 'tenant', identity.hostType, identity.hostId].join(':')
  }

  private normalizeQuery(query: XpertViewQuery) {
    return JSON.stringify({
      page: query.page ?? null,
      pageSize: query.pageSize ?? null,
      cursor: query.cursor ?? null,
      search: query.search ?? null,
      sortBy: query.sortBy ?? null,
      sortDirection: query.sortDirection ?? null,
      selectionId: query.selectionId ?? null,
      filters: (query.filters ?? []).map((filter) => ({
        key: filter.key,
        operator: filter.operator ?? 'eq',
        value: filter.value
      }))
    })
  }

  private trackKey(context: XpertResolvedViewHostContext, key: string, viewKey?: string) {
    this.trackedKeys.add(key)

    const hostScopeKey = this.getHostScopeKey(context)
    const hostKeys = this.hostKeys.get(hostScopeKey) ?? new Set<string>()
    hostKeys.add(key)
    this.hostKeys.set(hostScopeKey, hostKeys)

    const hostIdentityKey = this.getHostIdentityKey(context)
    const hostIdentityKeys = this.hostIdentityKeys.get(hostIdentityKey) ?? new Set<string>()
    hostIdentityKeys.add(key)
    this.hostIdentityKeys.set(hostIdentityKey, hostIdentityKeys)

    if (!viewKey) {
      return
    }

    const viewScopeKey = this.getViewScopeKey(context, viewKey)
    const viewKeys = this.viewKeys.get(viewScopeKey) ?? new Set<string>()
    viewKeys.add(key)
    this.viewKeys.set(viewScopeKey, viewKeys)

    const viewIdentityKey = this.getViewIdentityKey(context, viewKey)
    const viewIdentityKeys = this.viewIdentityKeys.get(viewIdentityKey) ?? new Set<string>()
    viewIdentityKeys.add(key)
    this.viewIdentityKeys.set(viewIdentityKey, viewIdentityKeys)
  }

  private async deleteKey(key: string) {
    await this.cacheManager.del(key)
    this.trackedKeys.delete(key)

    for (const [, keys] of this.hostKeys) {
      keys.delete(key)
    }

    for (const [, keys] of this.hostIdentityKeys) {
      keys.delete(key)
    }

    for (const [, keys] of this.viewKeys) {
      keys.delete(key)
    }

    for (const [, keys] of this.viewIdentityKeys) {
      keys.delete(key)
    }
  }
}
