import { firstValueFrom, lastValueFrom, Subject, of } from 'rxjs'
import type { PluginMarketplaceResponse } from '@xpert-ai/contracts'
import { PluginMarketplaceCache } from './plugin-marketplace-cache'

const catalog: PluginMarketplaceResponse = { updatedAt: null, total: 1, items: [{ name: 'cached' }], sources: [] }

describe('PluginMarketplaceCache', () => {
  it('shares in-flight requests and shows a snapshot while revalidating', async () => {
    const cache = new PluginMarketplaceCache()
    const response = new Subject<PluginMarketplaceResponse>()
    const load = jest.fn(() => response)
    const first = firstValueFrom(cache.get('user:tenant:org-a', load))
    const second = firstValueFrom(cache.get('user:tenant:org-a', load))
    expect(load).toHaveBeenCalledTimes(1)
    response.next(catalog)
    await expect(first).resolves.toEqual(catalog)
    await expect(second).resolves.toEqual(catalog)
    const refreshed = { ...catalog, total: 0, items: [] }
    const values: PluginMarketplaceResponse[] = []
    cache.get('user:tenant:org-a', () => of(refreshed)).subscribe((value) => values.push(value))
    expect(values).toEqual([catalog, refreshed])
  })

  it('never emits another organization or user snapshot', async () => {
    const cache = new PluginMarketplaceCache()
    await lastValueFrom(cache.get('user-a:tenant:org-a', () => of(catalog)))
    const response = new Subject<PluginMarketplaceResponse>()
    const next = jest.fn()
    const subscription = cache.get('user-b:tenant:org-b', () => response).subscribe(next)
    expect(next).not.toHaveBeenCalled()
    subscription.unsubscribe()
  })

  it('emits the existing list before a refresh error', async () => {
    const cache = new PluginMarketplaceCache()
    await lastValueFrom(cache.get('scope', () => of(catalog)))
    const response = new Subject<PluginMarketplaceResponse>()
    const next = jest.fn()
    const error = jest.fn()
    cache.get('scope', () => response).subscribe({ next, error })
    response.error(new Error('offline'))
    expect(next).toHaveBeenCalledWith(catalog)
    expect(error).toHaveBeenCalled()
  })
})
