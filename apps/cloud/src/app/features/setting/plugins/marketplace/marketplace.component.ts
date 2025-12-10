import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { routeAnimations } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { PluginAPIService } from '@metad/cloud/state'
import { OverlayAnimations } from '@metad/core'
import { debouncedSignal, myResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PluginComponent } from '../plugin/plugin.component'
import { TPlugin, TPluginWithDownloads } from '../types'


@Component({
  standalone: true,
  imports: [CommonModule, CdkMenuModule, CdkListboxModule, TranslateModule, FormsModule, NgmSelectComponent, PluginComponent],
  selector: 'xp-plugins-marketplace',
  templateUrl: './marketplace.component.html',
  styleUrls: ['./marketplace.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class PluginsMarketplaceComponent {
  readonly pluginAPI = inject(PluginAPIService)
  readonly i18n = new NgmI18nPipe()

  readonly #plugins = myResource<
    { url: string },
    {
      official: string[]
      partner: string[]
      community: string[]
      plugins: TPlugin[]
    }
  >({
    request: () => ({
      url: 'https://xpert-ai.github.io/xpert-plugin-registry/plugins/index.json'
    }),
    loader: ({ request }) => fetch(request.url).then((response) => response.json())
  })

  readonly manifest = this.#plugins.value
  readonly error = this.#plugins.error

  readonly pluginsWithDownloads = signal<TPluginWithDownloads[]>([])

  readonly keywords = model<string[]>([])
  readonly searchModel = model<string>('')
  readonly searchText = debouncedSignal(this.searchModel, 300)
  readonly categories = model<Array<'model' | 'toolset' | 'integration' | 'vector-store' | 'doc-source' | 'middleware'>>([])

  readonly plugins = computed(() => {
    const keywords = this.keywords()
    const plugins = (keywords?.length ? this.pluginsWithDownloads()?.filter((plugin) => plugin.keywords?.some((keyword) => keywords.includes(keyword))) :
      this.pluginsWithDownloads()) || []
    const searchText = this.searchText().toLowerCase()
    if (searchText) {
      return plugins.filter(
        (plugin) =>
          this.i18n.transform(plugin.displayName).toLowerCase().includes(searchText) ||
          this.i18n.transform(plugin.description)?.toLowerCase().includes(searchText) ||
          plugin.author?.name.toLowerCase().includes(searchText) ||
          plugin.keywords?.some((keyword) => keyword.toLowerCase().includes(searchText))
      )
    }
    if (this.categories().length) {
      return plugins.filter((plugin) => this.categories().includes(plugin.category?.toLowerCase() as any))
    }
    return plugins
  })

  readonly officialPlugins = computed(() => {
    const manifest = this.manifest()
    if (!manifest) {
      return []
    }
    return manifest.official
      .map((name) => this.plugins().find((plugin) => plugin.name === name))
      .filter((plugin) => !!plugin)
  })

  readonly partnerPlugins = computed(() => {
    const manifest = this.manifest()
    if (!manifest) {
      return []
    }
    return manifest.partner
      ?.map((name) => this.plugins().find((plugin) => plugin.name === name))
      .filter((plugin) => !!plugin)
  })

  readonly communityPlugins = computed(() => {
    const manifest = this.manifest()
    if (!manifest) {
      return []
    }
    return manifest.community
      ?.map((name) => this.plugins().find((plugin) => plugin.name === name))
      .filter((plugin) => !!plugin)
  })

  readonly keywordsOptions = computed(() => {
    const keywords = this.manifest()?.plugins.flatMap((plugin) => plugin.keywords ?? [])
    return Array.from(new Set(keywords))
      .sort()
      .map((keyword) => ({ label: keyword, value: keyword }))
  })

  constructor() {
     effect(async () => {
      const manifest = this.manifest()
      if (!manifest) return

      const plugins = manifest.plugins

      // Extract npm packages
      const npmPlugins = plugins.filter((p) => p.source?.type === 'npm')
      if (npmPlugins.length === 0) {
        this.pluginsWithDownloads.set(plugins)
        return
      }

      // For each npm plugin, fetch its downloads individually
      const updated = await Promise.all(
        plugins.map(async (p) => {
          if (p.source?.type !== 'npm') return p

          const pkgName = p.source.url.replace(/^https?:\/\/www\.npmjs\.com\/package\//, '')
          const encoded = encodeURIComponent(pkgName)
          const url = `https://api.npmjs.org/downloads/point/last-month/${encoded}`

          try {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Failed to fetch ${pkgName}`)
            const data = await res.json()
            return { ...p, downloads: { lastMonth: data.downloads } }
          } catch (err) {
            console.warn(`Failed to load downloads for ${pkgName}`, err)
            return { ...p }
          }
        })
      )

      this.pluginsWithDownloads.set(updated)
    }, { allowSignalWrites: true })

    // effect(() => {
    //   console.log(this.pluginsWithDownloads())
    // })
  }
}
