import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { IconComponent } from '@cloud/app/@shared/avatar/icon/icon.component'
import { myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectPluginAPI,
  IPluginComponentDefinition,
  PLUGIN_COMPONENT_TYPE,
  PluginComponentType
} from '@xpert-ai/cloud/state'
import { I18nObject, PLUGIN_LEVEL, PluginMeta, XpertTypeEnum } from '@xpert-ai/contracts'
import { ZardBadgeComponent, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { map, of } from 'rxjs'
import { BlankXpertWizardResult, XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
import { PluginResourcesComponent } from '../resources/resources.component'
import {
  TInstalledPlugin,
  TPluginMarketplaceContribution,
  TPluginResourceContribution,
  TPluginWithDownloads
} from '../types'

type TAppSetupAction =
  | { type: 'install-app'; resource: TPluginResourceContribution }
  | { type: 'initialize-template'; template: TPluginMarketplaceContribution }
  | { type: 'select-template' }
  | { type: 'details' }

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmI18nPipe, IconComponent, ZardBadgeComponent, ZardButtonComponent],
  selector: 'xp-plugin-marketplace-detail',
  templateUrl: './marketplace-detail.component.html',
  styleUrls: ['./marketplace-detail.component.scss']
})
export class PluginMarketplaceDetailComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #pluginAPI = injectPluginAPI()
  readonly #data = inject<{ plugin: TPluginWithDownloads }>(DIALOG_DATA)

  readonly plugin = signal(this.#data.plugin)
  readonly marketplaceContents = computed(() => this.plugin()?.contributions ?? [])
  readonly appContents = computed(() => this.marketplaceContents().filter((content) => content.type === 'app'))
  readonly assistantTemplateContents = computed(() =>
    this.marketplaceContents().filter((content) => this.isAssistantTemplate(content))
  )
  readonly contents = computed(() => this.marketplaceContents().filter((content) => this.isPrimaryContent(content)))
  readonly selectedApp = signal<TPluginMarketplaceContribution | null>(
    this.#data.plugin?.contributions?.find((content) => content.type === 'app') ?? null
  )

  readonly #components = myRxResource({
    request: () => {
      const plugin = this.plugin()
      const pluginName = this.resolveInstalledPluginName()
      return plugin?.installed && pluginName ? pluginName : null
    },
    loader: ({ request }) =>
      request ? this.#pluginAPI.getPluginComponents(request).pipe(map((result) => result.items ?? [])) : of([])
  })

  readonly componentDefinitions = computed(() => this.#components.value() ?? [])
  readonly componentDefinitionMap = computed(() => {
    const map = new Map<string, IPluginComponentDefinition>()
    for (const component of this.componentDefinitions()) {
      map.set(this.componentDefinitionKey(component.componentType, component.componentKey), component)
    }
    return map
  })

  readonly appCapabilityMap = computed(() => {
    const map = new Map<string, Map<string, TPluginMarketplaceContribution>>()
    const appContents = this.appContents()
    const defaultAppName = appContents.length === 1 ? appContents[0].name : null

    for (const content of this.marketplaceContents()) {
      if (!this.isAppCapability(content)) {
        continue
      }
      const appName = readString(content.metadata?.['app']) ?? defaultAppName
      if (!appName) {
        continue
      }
      const capabilities = map.get(appName) ?? new Map<string, TPluginMarketplaceContribution>()
      const capabilityKey = content.name
      const existing = capabilities.get(capabilityKey)
      if (!existing || appCapabilityPriority(content.type) < appCapabilityPriority(existing.type)) {
        capabilities.set(capabilityKey, content)
      }
      map.set(appName, capabilities)
    }

    return new Map(
      Array.from(map.entries()).map(([appName, capabilities]) => [appName, Array.from(capabilities.values())])
    )
  })

  close() {
    this.#dialogRef.close()
  }

  selectApp(content: TPluginMarketplaceContribution) {
    if (content.type === 'app') {
      this.selectedApp.set(content)
    }
  }

  isAssistantTemplate(content: TPluginMarketplaceContribution) {
    return content.type === 'assistant-template'
  }

  resourceContribution(content: TPluginMarketplaceContribution): TPluginResourceContribution | null {
    const componentType = marketplaceComponentType(content.type)
    if (!componentType) {
      return null
    }

    const component = this.componentDefinitionMap().get(this.componentDefinitionKey(componentType, content.name))
    if (!component) {
      return null
    }

    if (content.type === 'skill' && component.componentType === PLUGIN_COMPONENT_TYPE.SKILL) {
      return {
        ...content,
        type: 'skill',
        componentType: component.componentType
      }
    }
    if (content.type === 'tool' && component.componentType === PLUGIN_COMPONENT_TYPE.MCP_SERVER) {
      return {
        ...content,
        type: 'tool',
        componentType: component.componentType
      }
    }
    if (content.type === 'app' && component.componentType === PLUGIN_COMPONENT_TYPE.APP) {
      return {
        ...content,
        type: 'app',
        componentType: component.componentType
      }
    }
    if (content.type === 'hook' && component.componentType === PLUGIN_COMPONENT_TYPE.HOOK) {
      return {
        ...content,
        type: 'hook',
        componentType: component.componentType
      }
    }

    return null
  }

  initializeResource(content: TPluginResourceContribution, event?: MouseEvent) {
    event?.stopPropagation()
    const plugin = this.plugin()
    if (!plugin?.installed) {
      return
    }
    const pluginName = this.resolveInstalledPluginName()
    if (!pluginName) {
      return
    }

    this.#dialog.open(PluginResourcesComponent, {
      data: {
        plugin: {
          name: pluginName,
          packageName: pluginName,
          meta: {
            name: pluginName,
            displayName: readI18nText(plugin.displayName) ?? pluginName,
            description: readI18nText(plugin.description) ?? pluginName,
            version: plugin.version,
            category: normalizePluginCategory(plugin.category),
            icon: plugin.icon,
            author: plugin.author?.name,
            homepage: plugin.author?.url
          },
          currentVersion: plugin.version,
          loadStatus: 'loaded',
          isGlobal: false,
          level: PLUGIN_LEVEL.ORGANIZATION,
          effectiveInCurrentScope: true
        } satisfies TInstalledPlugin,
        initialComponents: [
          {
            componentType: content.componentType,
            componentKey: content.name
          }
        ],
        initialInstallMode: this.installModeForResource(content)
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  }

  initializeAssistantTemplate(content: TPluginMarketplaceContribution, event?: MouseEvent) {
    event?.stopPropagation()
    const plugin = this.plugin()
    if (!plugin?.installed || !this.isAssistantTemplate(content)) {
      return
    }

    const templateId = this.resolveTemplateId(content)
    if (!templateId) {
      return
    }

    this.#dialog
      .open<BlankXpertWizardResult>(XpertNewBlankComponent, {
        disableClose: true,
        data: {
          type: XpertTypeEnum.Agent,
          allowedModes: [XpertTypeEnum.Agent],
          allowWorkspaceSelection: true,
          initialStartMode: 'template',
          initialTemplateId: templateId,
          lockStartMode: true,
          lockType: true,
          completionMode: 'create'
        }
      })
      .closed.subscribe((result) => {
        if (result?.xpert?.id) {
          this.close()
          this.#router.navigate(['/xpert/x/', result.xpert.id])
        }
      })
  }

  handleAppAction(app: TPluginMarketplaceContribution, event?: MouseEvent) {
    event?.stopPropagation()
    const action = this.appSetupAction(app)

    if (this.appActionRequiresInstalledPlugin(action) && !this.plugin()?.installed) {
      return
    }

    switch (action.type) {
      case 'install-app':
        this.initializeResource(action.resource, event)
        break
      case 'initialize-template':
        this.initializeAssistantTemplate(action.template, event)
        break
      case 'select-template':
      case 'details':
        this.selectApp(app)
        break
    }
  }

  contentTypeIcon(type: string) {
    switch (type) {
      case 'app':
        return 'ri-apps-2-line'
      case 'view':
        return 'ri-layout-4-line'
      case 'middleware':
        return 'ri-flow-chart'
      case 'assistant-template':
        return 'ri-robot-2-line'
      case 'skill':
        return 'ri-puzzle-line'
      case 'hook':
        return 'ri-plug-line'
      case 'feature':
        return 'ri-sparkling-2-line'
      case 'tool':
        return 'ri-tools-line'
      default:
        return 'ri-puzzle-2-line'
    }
  }

  contentTypeBadgeClass(type: string) {
    switch (type) {
      case 'app':
        return 'h-5 border-primary/25 bg-primary/10 text-primary'
      case 'skill':
        return 'h-5 border-state-success-hover bg-state-success-hover/20 text-text-success'
      case 'tool':
        return 'h-5 border-accent/25 bg-accent/10 text-accent'
      case 'middleware':
        return 'h-5 border-accent/25 bg-accent/10 text-accent'
      case 'hook':
        return 'h-5 border-destructive/25 bg-destructive/10 text-destructive'
      case 'assistant-template':
        return 'h-5 border-state-warning-hover bg-state-warning-hover/20 text-text-warning'
      case 'view':
        return 'h-5 border-divider-regular bg-components-panel-bg text-text-secondary'
      case 'feature':
        return 'h-5 border-divider-regular bg-components-list-option-active-bg text-text-primary'
      default:
        return 'h-5 border-divider-regular bg-components-input-bg-normal text-text-secondary'
    }
  }

  appCapabilities(app: TPluginMarketplaceContribution) {
    return this.appCapabilityMap().get(app.name) ?? []
  }

  appTemplates(app: TPluginMarketplaceContribution) {
    const templates = this.assistantTemplateContents()
    const explicitTemplates = templates.filter((template) => readString(template.metadata?.['app']) === app.name)
    if (explicitTemplates.length) {
      return explicitTemplates
    }

    if (this.appContents().length === 1 && templates.length === 1) {
      return templates
    }

    return []
  }

  appSetupAction(app: TPluginMarketplaceContribution): TAppSetupAction {
    const resource = this.resourceContribution(app)
    if (resource) {
      return {
        type: 'install-app',
        resource
      }
    }

    const templates = this.appTemplates(app)
    if (templates.length === 1) {
      return {
        type: 'initialize-template',
        template: templates[0]
      }
    }
    if (templates.length > 1) {
      return {
        type: 'select-template'
      }
    }

    return {
      type: 'details'
    }
  }

  appActionRequiresInstalledPlugin(action: TAppSetupAction) {
    return action.type === 'install-app' || action.type === 'initialize-template'
  }

  private isPrimaryContent(content: TPluginMarketplaceContribution) {
    if (content.type === 'app') {
      return false
    }
    return content.type === 'assistant-template' || !!this.resourceContribution(content)
  }

  private isAppCapability(content: TPluginMarketplaceContribution) {
    if (content.type === 'view' || content.type === 'feature' || content.type === 'middleware') {
      return true
    }

    return content.type === 'tool' && !this.resourceContribution(content)
  }

  private resolveTemplateId(content: TPluginMarketplaceContribution) {
    const explicitTemplateId = readString(content.metadata?.['templateId'])
    if (explicitTemplateId) {
      return explicitTemplateId.includes(':') ? explicitTemplateId : this.withPluginNamespace(explicitTemplateId)
    }
    return this.withPluginNamespace(content.name)
  }

  private withPluginNamespace(templateKey: string) {
    if (templateKey.includes(':')) {
      return templateKey
    }
    const plugin = this.plugin()
    const pluginName = readString(plugin?.packageName) ?? readString(plugin?.name)
    return pluginName ? `${pluginName}:${templateKey}` : templateKey
  }

  private resolveInstalledPluginName() {
    const plugin = this.plugin()
    return readString(plugin?.packageName) ?? readString(plugin?.name)
  }

  private installModeForResource(content: TPluginResourceContribution) {
    return content.componentType === PLUGIN_COMPONENT_TYPE.HOOK ? 'xpert' : 'workspace'
  }

  private componentDefinitionKey(componentType: PluginComponentType, componentKey: string) {
    return `${componentType}:${componentKey}`
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readI18nText(value: I18nObject | string | undefined) {
  if (typeof value === 'string') {
    return value.trim() ? value.trim() : null
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  return (
    readString(value.en_US) ??
    readString(value.zh_Hans) ??
    Object.values(value).find((item): item is string => typeof item === 'string' && !!item.trim()) ??
    null
  )
}

function appCapabilityPriority(type: string) {
  switch (type) {
    case 'view':
      return 0
    case 'middleware':
      return 1
    case 'feature':
      return 2
    case 'tool':
      return 3
    default:
      return 4
  }
}

function normalizePluginCategory(value: string | undefined): PluginMeta['category'] {
  if (
    value === 'agent' ||
    value === 'doc-source' ||
    value === 'tools' ||
    value === 'model' ||
    value === 'vlm' ||
    value === 'vector-store' ||
    value === 'integration' ||
    value === 'datasource' ||
    value === 'database' ||
    value === 'middleware'
  ) {
    return value
  }
  return 'integration'
}

function marketplaceComponentType(type: string): PluginComponentType | null {
  switch (type) {
    case 'skill':
      return PLUGIN_COMPONENT_TYPE.SKILL
    case 'tool':
      return PLUGIN_COMPONENT_TYPE.MCP_SERVER
    case 'app':
      return PLUGIN_COMPONENT_TYPE.APP
    case 'hook':
      return PLUGIN_COMPONENT_TYPE.HOOK
    default:
      return null
  }
}
