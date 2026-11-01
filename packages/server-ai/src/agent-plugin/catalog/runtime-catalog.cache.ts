// Display snapshots only. Execution and selected-version authorization never use this cache.
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import type { Cache } from 'cache-manager'
import { createHash, randomUUID } from 'node:crypto'
import type { RuntimeResourceCatalog, RuntimeResourceCatalogPurpose } from '@xpert-ai/contracts'
import type { RuntimeResourceBinding } from '../runtime-resource-discovery'

export interface RuntimeCatalogInventory {
    bindings: RuntimeResourceBinding[]
    discovered: RuntimeResourceBinding[]
    candidates: RuntimeResourceBinding[]
    assistantPackages: string[]
}

export const CATALOG_TTL_MS = 15_000
const REVISION_KEY = 'runtime-resource-catalog:revision:v1'

export class ExpiringCatalogCache<T> {
    private readonly entries = new Map<string, { expires: number; value: Promise<T> }>()
    read(key: string, load: () => Promise<T>): Promise<T> {
        const existing = this.entries.get(key)
        if (existing && existing.expires > Date.now()) return existing.value
        if (this.entries.size >= 64) this.entries.delete(this.entries.keys().next().value)
        const entry = { expires: Date.now() + CATALOG_TTL_MS, value: Promise.resolve().then(load) }
        this.entries.set(key, entry)
        void entry.value.catch(() => {
            if (this.entries.get(key) === entry) this.entries.delete(key)
        })
        return entry.value
    }
    clear() {
        this.entries.clear()
    }
}

@Injectable()
export class RuntimeResourceCatalogCache {
    private readonly inventories = new ExpiringCatalogCache<RuntimeCatalogInventory>()
    private readonly pages = new ExpiringCatalogCache<RuntimeResourceCatalog>()
    private localRevision = randomUUID()
    constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

    async key(scope: object): Promise<string | null> {
        try {
            const revision = await this.cache.get<string>(REVISION_KEY)
            return createHash('sha256')
                .update(JSON.stringify([revision, this.localRevision, scope]))
                .digest('hex')
        } catch {
            return null
        }
    }
    async invalidate() {
        this.localRevision = randomUUID()
        this.inventories.clear()
        this.pages.clear()
        try {
            await this.cache.set(REVISION_KEY, randomUUID(), 86_400_000)
        } catch {
            /* Other workers expire within 15 seconds. */
        }
    }
    inventory(key: string | null, load: () => Promise<RuntimeCatalogInventory>) {
        return key ? this.inventories.read(key, load) : load()
    }
    async page(
        key: string | null,
        query: { purpose?: RuntimeResourceCatalogPurpose; search?: string; offset?: number; limit?: number },
        load: () => Promise<RuntimeResourceCatalog>
    ) {
        const value = key ? await this.pages.read(JSON.stringify([key, query]), load) : await load()
        // Callers and response transformers must not mutate shared entries.
        return structuredClone(value)
    }
}
