import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectHelpWebsite, routeAnimations } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { InDevelopmentComponent } from '@cloud/app/@theme'
import { PluginAPIService } from '@metad/cloud/state'
import { OverlayAnimations } from '@metad/core'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { debouncedSignal, NgmTooltipDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PluginsMarketplaceComponent } from './marketplace/marketplace.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    NgmSelectComponent,
    NgmHighlightDirective,
    IconComponent,
    NgmTooltipDirective,
    InDevelopmentComponent,
    PluginsMarketplaceComponent
  ],
  selector: 'xp-settings-plugins',
  templateUrl: './plugins.component.html',
  styleUrls: ['./plugins.component.scss'],
  animations: [routeAnimations, ...OverlayAnimations]
})
export class PluginsComponent {
  readonly pluginAPI = inject(PluginAPIService)
  readonly releaseHelpUrl = injectHelpWebsite('/docs/plugin/release-to-xpert-marketplace')

  readonly plugins = toSignal(this.pluginAPI.getPlugins(), { initialValue: [] })

  readonly category = signal<'plugins' | 'marketplace'>('plugins')

  readonly searchText = model('')
  readonly #searchText = debouncedSignal(this.searchText, 300)

  readonly categories = model<string[]>([])
  readonly keywords = model<string[]>([])

  readonly filteredPlugins = computed(() => {
    const searchText = this.#searchText().toLowerCase()
    let plugins = this.plugins()
    if (this.categories().length) {
      plugins = plugins.filter((plugin) => this.categories().includes(plugin.meta.category))
    }
    if (this.keywords().length) {
      plugins = plugins.filter(
        (plugin) =>
          plugin.meta.keywords?.length && plugin.meta.keywords.some((keyword) => this.keywords().includes(keyword))
      )
    }
    if (searchText) {
      plugins = plugins.filter(
        (plugin) =>
          plugin.meta.description?.toLowerCase().includes(searchText) ||
          plugin.meta.displayName?.toLowerCase().includes(searchText) ||
          plugin.name.toLowerCase().includes(searchText) ||
          plugin.meta.keywords?.some((keyword) => keyword.toLowerCase().includes(searchText))
      )
    }
    return plugins
  })

  readonly #categories = computed(() => {
    const categories = new Set<string>()
    this.plugins().forEach((plugin) => {
      if (plugin.meta.category) {
        categories.add(plugin.meta.category)
      }
    })
    return Array.from(categories)
  })

  readonly categoriesOptions = computed(() => {
    return this.#categories().map((category) => ({
      label: category,
      value: category
    }))
  })

  readonly #keywords = computed(() => {
    const keywords = new Set<string>()
    this.plugins().forEach((plugin) => {
      if (plugin.meta.keywords) {
        plugin.meta.keywords.forEach((keyword) => keywords.add(keyword))
      }
    })
    return Array.from(keywords)
  })

  readonly keywordsOptions = computed(() => {
    return this.#keywords().map((keyword) => ({
      label: keyword,
      value: keyword
    }))
  })

  // constructor() {
  //   effect(() => {
  //     console.log(this.plugins())
  //   })
  // }

  toggleKeyword(keyword: string) {
    this.keywords.update((keywords) => {
      if (keywords.includes(keyword)) {
        return keywords.filter((k) => k !== keyword)
      } else {
        return [...keywords, keyword]
      }
    })
  }
}
