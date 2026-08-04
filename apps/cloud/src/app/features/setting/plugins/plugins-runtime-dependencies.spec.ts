import { TestBed } from '@angular/core/testing'
import { PluginsMarketplaceComponent } from './marketplace/marketplace.component'
import { PluginsComponent } from './plugins.component'

describe('plugins runtime dependencies', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('resolves the plugins page after the marketplace entry is evaluated first', async () => {
    expect(PluginsMarketplaceComponent).toBeDefined()

    await expect(
      TestBed.configureTestingModule({
        imports: [PluginsComponent]
      }).compileComponents()
    ).resolves.toBeUndefined()
  })
})
