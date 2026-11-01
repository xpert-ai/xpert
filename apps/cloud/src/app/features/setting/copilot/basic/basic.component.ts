import { ConnectionImpactDialogComponent } from '../connection-impact.component'
import { ModelReplacementDialogComponent } from '../model-replacement/replacement.component'
import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal, untracked } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IAiProviderEntity, ICopilot, IPluginDescriptor, ProviderModelCatalog } from '@xpert-ai/contracts'
import { ZardBadgeComponent, XpI18nPipe, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotProviderService, CopilotServerService, getErrorMessage, injectToastr } from '../../../../@core'
import { injectOrganizationId, PluginAPIService } from '../../../../@core/state'
import { CopilotAiProvidersComponent } from '../../../../@shared/copilot/ai-providers/providers.component'
import { CopilotProviderComponent } from '../../../../@shared/copilot/copilot-provider/provider.component'
import { CopilotAiProviderAuthComponent } from '../../../../@shared/copilot/provider-authorization/authorization.component'
import { DefaultModelsDialogComponent } from '../default-models/defaults.component'
import { ProviderConnectionsComponent } from './connection-menu.component'
import { ProviderMarketplaceComponent } from './provider-marketplace.component'
import { ProviderPluginVersionComponent } from './provider-plugin-version.component'

type ProviderStatus = 'configured' | 'pending' | 'error'
interface ProviderGroup {
  id: string
  schema: IAiProviderEntity
  connections: ICopilot[]
  status: ProviderStatus
}

@Component({
  standalone: true,
  selector: 'xp-settings-copilot-basic',
  templateUrl: './basic.component.html',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    XpI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    CopilotProviderComponent,
    ProviderConnectionsComponent,
    ProviderMarketplaceComponent,
    ProviderPluginVersionComponent
  ],
  host: { class: 'block w-full overflow-auto p-6' }
})
export class CopilotBasicComponent {
  readonly copilotServer = inject(CopilotServerService)
  readonly providers = inject(CopilotProviderService)
  readonly pluginAPI = inject(PluginAPIService)
  readonly plugins = signal<IPluginDescriptor[]>([])
  readonly dialog = inject(Dialog)
  readonly toastr = injectToastr()
  readonly organizationId = injectOrganizationId()
  readonly i18n = new XpI18nPipe()
  readonly loading = signal(true)
  readonly error = signal('')
  readonly search = signal('')
  readonly status = signal<'all' | ProviderStatus>('all')
  readonly schemas = signal<IAiProviderEntity[]>([])
  readonly connections = signal<ICopilot[]>([])
  readonly catalogs = signal<Record<string, ProviderModelCatalog>>({})
  readonly selected = signal<Record<string, string>>({})
  readonly selectionQueries = signal<Record<string, string>>({})
  readonly catalogErrors = signal(new Set<string>())
  private loadVersion = 0
  readonly filters = ['all', 'configured', 'pending', 'error'] as const
  readonly groups = computed<ProviderGroup[]>(() =>
    this.schemas().map((schema) => {
      const connections = this.connections().filter((item) => item.modelProvider?.providerName === schema.provider)
      return {
        id: schema.provider,
        schema,
        connections,
        status: !connections.length
          ? 'pending'
          : connections.some((item) => item.modelProvider?.isValid === false || this.catalogErrors().has(item.id))
            ? 'error'
            : connections.some((item) => item.enabled && item.modelProvider?.options?.enabledModels?.length !== 0)
              ? 'configured'
              : 'pending'
      }
    })
  )
  readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase()
    return this.groups()
      .filter(
        (group) =>
          (this.status() === 'all' || group.status === this.status()) &&
          (!query ||
            [
              group.id,
              this.i18n.transform(group.schema.label),
              ...group.connections.flatMap((connection) => {
                const catalog = this.catalogs()[connection.id]
                return [
                  connection.name,
                  connection.id,
                  ...(catalog?.builtin ?? []).map((model) => model.model),
                  ...(catalog?.custom ?? []).map((model) => model.modelName)
                ]
              })
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(query))
      )
      .sort((a, b) => Number(a.status === 'pending') - Number(b.status === 'pending'))
  })
  constructor() {
    effect(() => {
      this.organizationId()
      untracked(() => void this.load())
    })
  }
  count(status: 'all' | ProviderStatus) {
    return this.groups().filter((group) => status === 'all' || group.status === status).length
  }
  active(group: ProviderGroup) {
    const query = this.search().trim().toLowerCase()
    const selected = group.connections.find((item) => item.id === this.selected()[group.id])
    if (selected && (!query || this.selectionQueries()[group.id] === query)) return selected
    if (query) {
      const match = group.connections.find((item) => {
        const catalog = this.catalogs()[item.id]
        return [
          item.name,
          item.id,
          ...(catalog?.builtin ?? []).map((row) => row.model),
          ...(catalog?.custom ?? []).map((row) => row.modelName)
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query))
      })
      if (match) return match
    }
    return selected ?? group.connections[0]
  }
  choose(group: ProviderGroup, id: string) {
    this.selected.update((value) => ({ ...value, [group.id]: id }))
    this.selectionQueries.update((value) => ({ ...value, [group.id]: this.search().trim().toLowerCase() }))
  }
  async load() {
    const version = ++this.loadVersion
    this.loading.set(true)
    this.error.set('')
    this.connections.set([])
    this.catalogs.set({})
    this.catalogErrors.set(new Set())
    this.plugins.set([])
    try {
      const [schemas, result] = await Promise.all([
        this.copilotServer.refreshAiProviders(),
        firstValueFrom(this.copilotServer.getAllInOrg())
      ])
      if (version !== this.loadVersion) return
      this.schemas.set(schemas)
      this.connections.set(result.items)
      void this.loadPluginVersions(schemas, version)
      const catalogs: Record<string, ProviderModelCatalog> = {}
      const errors = new Set<string>()
      await Promise.all(
        result.items
          .filter((item) => item.modelProvider?.id)
          .map(async (item) => {
            try {
              catalogs[item.id] = await firstValueFrom(this.providers.getModels(item.modelProvider.id))
            } catch {
              errors.add(item.id)
            }
          })
      )
      if (version !== this.loadVersion) return
      this.catalogs.set(catalogs)
      this.catalogErrors.set(errors)
    } catch (error) {
      if (version === this.loadVersion) this.error.set(getErrorMessage(error))
    } finally {
      if (version === this.loadVersion) this.loading.set(false)
    }
  }
  providerPlugin(schema: IAiProviderEntity) {
    return this.plugins().find(
      (plugin) =>
        plugin.name === schema.plugin?.name &&
        plugin.scopeKey === schema.plugin?.scopeKey &&
        plugin.effectiveInCurrentScope
    )
  }
  private async loadPluginVersions(schemas: IAiProviderEntity[], version: number) {
    const names = [...new Set(schemas.flatMap((schema) => (schema.plugin ? [schema.plugin.name] : [])))]
    if (!names.length) return
    try {
      const plugins = await firstValueFrom(this.pluginAPI.getByNames(names))
      if (version !== this.loadVersion) return
      this.plugins.set(plugins)
      const versions = await firstValueFrom(this.pluginAPI.getLatestVersions(names))
      if (version !== this.loadVersion) return
      this.plugins.set(
        plugins.map((plugin) => {
          const latest = versions.find(
            (item) => item.name === plugin.name && item.organizationId === plugin.organizationId
          )
          return latest ? { ...plugin, latestVersion: latest.latestVersion, hasUpdate: latest.hasUpdate } : plugin
        })
      )
    } catch {
      /* Version discovery must not block provider configuration. */
    }
  }
  async refresh() {
    this.copilotServer.refresh()
    await this.load()
  }
  async addProvider(schema?: IAiProviderEntity) {
    const provider =
      schema ??
      (await firstValueFrom(
        this.dialog.open<IAiProviderEntity>(CopilotAiProvidersComponent, {
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)',
          data: { selectOnly: true }
        }).closed
      ))
    if (!provider) return
    const result = await firstValueFrom(
      this.dialog.open(CopilotAiProviderAuthComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        data: { provider }
      }).closed
    )
    if (result) await this.refresh()
  }
  async editConnection(provider: IAiProviderEntity, copilot: ICopilot) {
    const result = await firstValueFrom(
      this.dialog.open(CopilotAiProviderAuthComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        data: { provider, providerId: copilot.modelProvider.id, copilot }
      }).closed
    )
    if (result) await this.refresh()
  }
  bulkReplace() {
    this.dialog.open(ModelReplacementDialogComponent, {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: 'calc(100vw - 32px)',
      disableClose: true
    })
  }
  async defaults() {
    const saved = await firstValueFrom(
      this.dialog.open<boolean>(DefaultModelsDialogComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true
      }).closed
    )
    if (saved) await this.refresh()
  }
  async toggleConnection(connection: ICopilot) {
    if (
      connection.enabled &&
      !(await firstValueFrom(
        this.dialog.open<boolean>(ConnectionImpactDialogComponent, {
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)',
          data: connection
        }).closed
      ))
    )
      return
    try {
      await firstValueFrom(this.copilotServer.update(connection.id, { enabled: !connection.enabled }))
      await this.refresh()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    }
  }
}
