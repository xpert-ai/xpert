import { Component, DestroyRef, computed, effect, inject, output, signal, untracked } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { PluginMarketplaceResponse } from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent, ZardInputDirective, ZardLoaderComponent } from '@xpert-ai/headless-ui'
import { lastValueFrom } from 'rxjs'
import { getErrorMessage } from '../../../../@core'
import { injectActiveScope, PluginAPIService } from '../../../../@core/state'
import { SettingsPluginComponent } from '../../plugins/plugin/plugin.component'
import {
  PLUGIN_MARKETPLACE_TARGET_APP,
  resolvePluginMarketplaceGrouping
} from '../../plugins/marketplace/plugin-marketplace-categories'
import { normalizeMarketplacePlugin } from '../../plugins/marketplace/plugin-marketplace-normalize'

@Component({
  standalone: true,
  selector: 'xp-provider-marketplace',
  imports: [
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardLoaderComponent,
    SettingsPluginComponent
  ],
  templateUrl: './provider-marketplace.component.html',
  host: { class: 'block mt-8 border-t border-border pt-6' }
})
export class ProviderMarketplaceComponent {
  readonly #api = inject(PluginAPIService)
  readonly #scope = injectActiveScope()
  readonly #destroyRef = inject(DestroyRef)
  readonly #i18n = new XpI18nPipe()
  readonly providersChanged = output<void>()
  readonly manifest = signal<PluginMarketplaceResponse | null>(null)
  readonly loading = signal(true)
  readonly error = signal('')
  readonly search = signal('')
  readonly available = computed(() =>
    (this.manifest()?.items ?? [])
      .filter((item) => {
        const type = resolvePluginMarketplaceGrouping(item).subcategory
        return (
          !item.installed &&
          !item.deprecated &&
          (item.category === 'model' || item.category === 'vlm' || type === 'model' || type === 'vlm')
        )
      })
      .map(normalizeMarketplacePlugin)
  )
  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase()
    return this.available().filter(
      (plugin) =>
        !query ||
        [
          plugin.name,
          this.#i18n.transform(plugin.displayName),
          this.#i18n.transform(plugin.description),
          plugin.author.name
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
    )
  })
  readonly reload = () => void this.load()
  readonly refreshProviders = () => this.providersChanged.emit()
  private request = 0

  constructor() {
    effect(() => {
      this.#scope()
      untracked(() => void this.load())
    })
  }

  async load() {
    const request = ++this.request
    this.loading.set(true)
    this.error.set('')
    this.manifest.set(null)
    try {
      // The marketplace cache can emit a snapshot followed by fresh scoped data.
      const manifest = await lastValueFrom(
        this.#api.getMarketplace({ targetApp: PLUGIN_MARKETPLACE_TARGET_APP, view: 'summary' })
      )
      if (this.#destroyRef.destroyed || request !== this.request) return
      this.manifest.set(manifest)
    } catch (error) {
      if (!this.#destroyRef.destroyed && request === this.request) this.error.set(getErrorMessage(error))
    } finally {
      if (!this.#destroyRef.destroyed && request === this.request) this.loading.set(false)
    }
  }
}
