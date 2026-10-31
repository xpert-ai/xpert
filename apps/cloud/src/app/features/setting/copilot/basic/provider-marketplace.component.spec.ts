import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { PluginMarketplaceItem, PluginMarketplaceResponse } from '@xpert-ai/contracts'
import { concat, of, Subject, throwError } from 'rxjs'
import { PluginAPIService, Store } from '../../../../@core/state'
import { ProviderMarketplaceComponent } from './provider-marketplace.component'

const response = (items: PluginMarketplaceItem[]): PluginMarketplaceResponse => ({
  items,
  total: items.length,
  updatedAt: null,
  sources: []
})

describe('inline model provider marketplace', () => {
  function setup() {
    const api = { getMarketplace: jest.fn().mockReturnValue(of(response([]))) }
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: PluginAPIService, useValue: api },
        { provide: Store, useValue: { activeScope: null, selectActiveScope: () => of(null) } }
      ]
    })
    return { api, component: TestBed.runInInjectionContext(() => new ProviderMarketplaceComponent()) }
  }
  afterEach(() => TestBed.resetTestingModule())

  it('uses explicit model categories and excludes installed, deprecated and unrelated plugins', async () => {
    const { api, component } = setup()
    api.getMarketplace.mockReturnValue(
      of(
        response([
          { name: 'model', category: 'model' },
          { name: 'vision', category: 'vlm' },
          {
            name: 'metadata',
            targetAppMeta: { xpert: { marketplace: { category: 'developer-tools', subcategory: 'model' } } }
          },
          { name: 'installed', category: 'model', installed: true },
          { name: 'deprecated', category: 'model', deprecated: true },
          { name: 'looks-like-a-model-provider', category: 'tools' }
        ])
      )
    )
    await component.load()
    expect(component.available().map((plugin) => plugin.name)).toEqual(['model', 'vision', 'metadata'])
    expect(api.getMarketplace).toHaveBeenCalledWith({ targetApp: 'xpert', view: 'summary' })
  })

  it('searches display name, package, description and publisher', async () => {
    const { api, component } = setup()
    api.getMarketplace.mockReturnValue(
      of(
        response([
          {
            name: '@example/cloud',
            displayName: 'Example',
            description: 'Embedding models',
            author: 'Publisher',
            category: 'model'
          }
        ])
      )
    )
    await component.load()
    for (const query of ['example', '@example/cloud', 'embedding', 'PUBLISHER']) {
      component.search.set(query)
      expect(component.filtered()).toHaveLength(1)
    }
    component.search.set('missing')
    expect(component.filtered()).toHaveLength(0)
  })

  it('waits for fresh installation state instead of settling on a cached snapshot', async () => {
    const { api, component } = setup()
    const fresh = new Subject<PluginMarketplaceResponse>()
    api.getMarketplace.mockReturnValue(concat(of(response([{ name: 'cached', category: 'model' }])), fresh))
    const pending = component.load()
    expect(component.loading()).toBe(true)
    fresh.next(response([{ name: 'cached', category: 'model', installed: true }]))
    fresh.complete()
    await pending
    expect(component.available()).toEqual([])
    expect(component.loading()).toBe(false)
  })

  it('ignores an earlier scoped response that arrives after a newer load', async () => {
    const { api, component } = setup()
    const earlier = new Subject<PluginMarketplaceResponse>()
    api.getMarketplace.mockReturnValueOnce(earlier)
    const pending = component.load()
    api.getMarketplace.mockReturnValue(of(response([{ name: 'current', category: 'model' }])))
    await component.load()
    earlier.next(response([{ name: 'old', category: 'model' }]))
    earlier.complete()
    await pending
    expect(component.available().map((plugin) => plugin.name)).toEqual(['current'])
  })

  it('recovers from a catalog error on retry', async () => {
    const { api, component } = setup()
    api.getMarketplace.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    await component.load()
    expect(component.error()).toContain('Unavailable')
    expect(component.loading()).toBe(false)
    await component.load()
    expect(component.error()).toBe('')
    expect(component.manifest()).toEqual(response([]))
  })

  it('refreshes provider schemas through the existing post-install callback', () => {
    const { component } = setup()
    const emit = jest.spyOn(component.providersChanged, 'emit')
    component.refreshProviders()
    expect(emit).toHaveBeenCalledTimes(1)
  })
})
