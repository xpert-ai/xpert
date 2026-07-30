import { Component } from '@angular/core'
import { PluginsMarketplaceComponent } from '../features/setting/plugins/marketplace/marketplace.component'

@Component({
  standalone: true,
  imports: [PluginsMarketplaceComponent],
  selector: 'xp-public-plugin-marketplace-page',
  template: '<xp-plugins-marketplace [publicCatalog]="true" />',
  host: {
    class: 'flex min-h-0 grow flex-col overflow-auto pt-8'
  }
})
export class PublicPluginMarketplacePageComponent {}
