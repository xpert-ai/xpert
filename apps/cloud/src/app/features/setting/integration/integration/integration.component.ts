import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core'
import { RouterModule } from '@angular/router'
import { IsDirty } from '@xpert-ai/core'
import { I18nObject, IIntegration, XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardDividerComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { of } from 'rxjs'
import { IntegrationService, ViewExtensionApiService } from '../../../../@core'
import { IntegrationConfigurationComponent } from './configuration.component'
import { IntegrationExtensionViewComponent } from './integration-extension-view.component'

interface IntegrationShellTab {
  key: string
  kind: 'config' | 'view'
  title?: I18nObject
  icon: string
  routerLink: readonly string[]
  badge?: string | number
  active: boolean
}

@Component({
  standalone: true,
  selector: 'pac-settings-integration',
  templateUrl: './integration.component.html',
  styleUrls: ['./integration.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    NgmI18nPipe,
    ZardDividerComponent,
    ...ZardTabsImports,
    IntegrationConfigurationComponent,
    IntegrationExtensionViewComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntegrationComponent implements IsDirty {
  readonly #integrationAPI = inject(IntegrationService)
  readonly #viewExtensionAPI = inject(ViewExtensionApiService)
  readonly configurationComponent = viewChild(IntegrationConfigurationComponent)
  readonly paramId = injectParams('id')
  readonly viewKey = injectParams('viewKey')
  readonly integration = derivedAsync<IIntegration | null>(
    () => {
      const integrationId = this.paramId()
      return integrationId ? this.#integrationAPI.getById(integrationId) : of(null)
    },
    { initialValue: null }
  )
  readonly extensionViews = derivedAsync<XpertExtensionViewManifest[]>(
    () => {
      const integrationId = this.paramId()
      return integrationId ? this.#viewExtensionAPI.getSlotViews('integration', integrationId, 'detail.main_tabs') : of([])
    },
    { initialValue: [] }
  )
  readonly tabs = computed<IntegrationShellTab[]>(() => {
    const integrationId = this.paramId()
    const activeViewKey = this.viewKey()
    const tabs: IntegrationShellTab[] = [
      {
        key: 'config',
        kind: 'config',
        icon: 'ri-settings-3-line',
        routerLink: integrationId ? ['/settings/integration', integrationId] : ['/settings/integration/create'],
        active: !activeViewKey
      }
    ]

    if (!integrationId) {
      return tabs
    }

    const extensionTabs = [...this.extensionViews()]
      .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))
      .map(
        (view): IntegrationShellTab => ({
          key: view.key,
          kind: 'view',
          title: view.title,
          icon: view.icon || 'ri-puzzle-2-line',
          routerLink: ['/settings/integration', integrationId, 'view', view.key],
          badge: view.badge?.value,
          active: activeViewKey === view.key
        })
      )

    return [...tabs, ...extensionTabs]
  })
  readonly hasExtensionTabs = computed(() => this.extensionViews().length > 0)
  readonly activeHostId = computed(() => {
    const integrationId = this.paramId()
    const activeViewKey = this.viewKey()
    return integrationId && activeViewKey ? integrationId : null
  })
  readonly activeViewDescription = computed(() => {
    const activeViewKey = this.viewKey()
    return activeViewKey ? this.extensionViews().find((view) => view.key === activeViewKey)?.description ?? null : null
  })
  readonly pageTitle = computed(() => {
    if (!this.viewKey()) {
      return null
    }

    const name = this.integration()?.name?.trim()
    return name || null
  })
  readonly pageSubtitle = computed(() => {
    if (!this.viewKey()) {
      return null
    }

    const description = this.integration()?.description?.trim()
    return description || this.activeViewDescription()
  })

  isDirty(): boolean {
    return this.configurationComponent()?.isDirty() ?? false
  }
}
