import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, ElementRef, computed, inject, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, RouterModule } from '@angular/router'
import { getErrorMessage } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { I18nService } from '@cloud/app/@shared/i18n'
import { IPluginMarketplaceDetailItem, injectPluginAPI, PluginMarketplaceItem } from '@xpert-ai/cloud/state'
import { JSONValue } from '@xpert-ai/contracts'
import { ZardBadgeComponent, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { map } from 'rxjs'
import { PluginInstallComponent } from '../install/install.component'
import { mergeMarketplaceContributions } from '../plugin-marketplace-metadata'
import { pluginNameFromMarketplaceRoute } from '../plugin-marketplace-navigation'
import { getPluginMarketplaceSourceI18nKey, TPluginWithDownloads } from '../types'
import { PluginMarketplaceDetailComponent } from './marketplace-detail.component'
import { PLUGIN_MARKETPLACE_TARGET_APP } from '../plugin-marketplace-categories'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    MarkdownModule,
    NgmI18nPipe,
    NgmSpinComponent,
    IconComponent,
    ZardBadgeComponent,
    ZardButtonComponent
  ],
  selector: 'xp-plugin-marketplace-readme-page',
  templateUrl: './marketplace-readme-page.component.html',
  styleUrls: ['./marketplace-readme-page.component.scss']
})
export class PluginMarketplaceReadmePageComponent {
  readonly #route = inject(ActivatedRoute)
  readonly #dialog = inject(Dialog)
  readonly #pluginAPI = injectPluginAPI()
  readonly #i18n = inject(I18nService)

  readonly readmeMarkdown = viewChild<ElementRef<HTMLElement>>('readmeMarkdown')

  readonly routePluginName = toSignal(
    this.#route.paramMap.pipe(
      map((params) => pluginNameFromMarketplaceRoute(params.get('scope'), params.get('packageName')))
    ),
    {
      initialValue: pluginNameFromMarketplaceRoute(
        this.#route.snapshot.paramMap.get('scope'),
        this.#route.snapshot.paramMap.get('packageName')
      )
    }
  )
  readonly sourceId = toSignal(this.#route.queryParamMap.pipe(map((params) => params.get('sourceId'))), {
    initialValue: null
  })

  readonly #detail = myRxResource({
    request: () => ({
      name: this.routePluginName(),
      sourceId: this.sourceId(),
      locale: this.#i18n.language()
    }),
    loader: ({ request }) =>
      this.#pluginAPI.getMarketplacePluginDetail({
        name: request.name,
        targetApp: PLUGIN_MARKETPLACE_TARGET_APP,
        ...(request.sourceId ? { sourceId: request.sourceId } : {}),
        ...(request.locale ? { locale: request.locale } : {})
      })
  })

  readonly detail = computed(() => this.#detail.value() ?? null)
  readonly loading = computed(() => this.#detail.status() === 'loading')
  readonly error = computed(() => {
    const error = this.#detail.error()
    return error ? getErrorMessage(error) : null
  })
  readonly pluginForDialog = computed(() => {
    const detail = this.detail()
    return detail ? toPluginWithDownloads(detail) : null
  })
  readonly hasSetupContent = computed(() => !!this.pluginForDialog()?.contributions?.length)

  openInstall() {
    const plugin = this.pluginForDialog()
    if (!plugin) {
      return
    }

    this.#dialog.open(PluginInstallComponent, {
      data: {
        plugin,
        reload: () => this.#detail.reload()
      },
      disableClose: true
    })
  }

  openSetup() {
    const plugin = this.pluginForDialog()
    if (!plugin) {
      return
    }

    this.#dialog.open(PluginMarketplaceDetailComponent, {
      data: {
        plugin
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  reload() {
    this.#detail.reload()
  }

  normalizeReadmeLinks() {
    const element = this.readmeMarkdown()?.nativeElement
    if (!element) {
      return
    }

    for (const anchor of Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = anchor.getAttribute('href')?.trim()
      if (!href || isUnsafeReadmeHref(href)) {
        anchor.removeAttribute('href')
        anchor.removeAttribute('target')
        anchor.removeAttribute('rel')
        continue
      }

      if (href.startsWith('#')) {
        anchor.removeAttribute('target')
        anchor.setAttribute('rel', 'nofollow')
        continue
      }

      if (isExternalReadmeHref(href)) {
        anchor.setAttribute('target', '_blank')
        anchor.setAttribute('rel', 'noreferrer noopener')
        continue
      }

      if (href.toLowerCase().startsWith('mailto:')) {
        anchor.removeAttribute('target')
        anchor.setAttribute('rel', 'nofollow')
        continue
      }

      anchor.setAttribute('title', href)
      anchor.setAttribute('data-readme-relative-link', href)
      anchor.removeAttribute('href')
      anchor.removeAttribute('target')
      anchor.setAttribute('rel', 'nofollow')
    }
  }

  sourceLabel(detail: IPluginMarketplaceDetailItem) {
    const sourceKey = getPluginMarketplaceSourceI18nKey(detail.sourceId, detail.sourceName)
    return sourceKey ? this.#i18n.instant(sourceKey, { Default: detail.sourceName }) : (detail.sourceName ?? '-')
  }

  homepageUrl(detail: IPluginMarketplaceDetailItem) {
    const marketplacePlugin = readRecord(detail.marketplacePlugin)
    return readString(marketplacePlugin?.homepage) ?? readString(detail.source?.url) ?? null
  }

  repositoryUrl(detail: IPluginMarketplaceDetailItem) {
    const marketplacePlugin = readRecord(detail.marketplacePlugin)
    const repository = marketplacePlugin?.repository
    if (typeof repository === 'string') {
      return repository
    }
    return readString(readRecord(repository)?.url)
  }

  packageName(detail: IPluginMarketplaceDetailItem) {
    return detail.packageName ?? detail.name
  }
}

function toPluginWithDownloads(item: IPluginMarketplaceDetailItem): TPluginWithDownloads {
  const name = item.name || item.packageName || ''
  const packageName = item.packageName ?? name
  const sourceId = item.sourceId ?? null
  const sourceName = item.sourceName ?? null

  return {
    name,
    packageName,
    displayName: item.displayName ?? name,
    description: item.description ?? name,
    version: item.version ?? '',
    level: item.level,
    deprecated: item.deprecated,
    deprecationMessage: item.deprecationMessage ?? undefined,
    category: item.category ?? 'integration',
    icon: item.icon ?? {
      type: 'font',
      value: 'ri-puzzle-2-line'
    },
    author: normalizeAuthor(item.author),
    source: normalizeSource(item.source),
    keywords: item.keywords,
    downloads: item.downloads,
    sourceId,
    sourceName,
    sourceNameI18nKey: item.sourceNameI18nKey ?? getPluginMarketplaceSourceI18nKey(sourceId, sourceName),
    installed: item.installed,
    screenshots: item.screenshots,
    contributions: mergeMarketplaceContributions(item.contributions),
    defaultPrompt: item.defaultPrompt,
    trialShortcuts: item.trialShortcuts,
    operationSummary: item.operationSummary,
    targetAppMeta: item.targetAppMeta ?? null
  }
}

function normalizeAuthor(value: PluginMarketplaceItem['author']): TPluginWithDownloads['author'] {
  if (typeof value === 'string') {
    return {
      name: value,
      url: ''
    }
  }

  return {
    name: value?.name ?? value?.displayName ?? 'XpertAI',
    url: value?.url ?? value?.homepage ?? ''
  }
}

function normalizeSource(value: PluginMarketplaceItem['source']): TPluginWithDownloads['source'] {
  if (!value?.url) {
    return undefined
  }

  return {
    type: normalizeSourceType(value.type),
    url: value.url
  }
}

function normalizeSourceType(type: string | undefined): NonNullable<TPluginWithDownloads['source']>['type'] {
  if (
    type === 'marketplace' ||
    type === 'github' ||
    type === 'git' ||
    type === 'url' ||
    type === 'npm' ||
    type === 'website'
  ) {
    return type
  }
  return 'other'
}

function readRecord(value: JSONValue | unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isUnsafeReadmeHref(href: string) {
  return /^(javascript|data|vbscript):/i.test(href.replace(/\s+/g, ''))
}

function isExternalReadmeHref(href: string) {
  return /^(https?:)?\/\//i.test(href)
}
