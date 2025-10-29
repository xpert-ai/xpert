import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { Component, computed, effect, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { routeAnimations } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { PluginAPIService } from '@metad/cloud/state'
import { OverlayAnimations } from '@metad/core'
import { debouncedSignal, myResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PluginComponent } from '../plugin/plugin.component'
import { TPlugin } from '../types'


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

  readonly keywords = model<string[]>([])
  readonly searchModel = model<string>('')
  readonly searchText = debouncedSignal(this.searchModel, 300)
  readonly categories = model<Array<'model' | 'toolset' | 'integration' | 'vector-store' | 'doc-source'>>([])

  readonly plugins = computed(() => {
    const keywords = this.keywords()
    const plugins = (keywords?.length ? this.manifest()?.plugins.filter((plugin) => plugin.keywords?.some((keyword) => keywords.includes(keyword))) :
      this.manifest()?.plugins) || []
    const searchText = this.searchText().toLowerCase()
    if (searchText) {
      return plugins.filter(
        (plugin) =>
          plugin.name.toLowerCase().includes(searchText) ||
          plugin.description.toLowerCase().includes(searchText) ||
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
    effect(() => {
      console.log(this.manifest())
    })
  }
}
