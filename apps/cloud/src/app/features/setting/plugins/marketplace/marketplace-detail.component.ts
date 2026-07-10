import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar/icon/icon.component'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectPluginAPI,
  IPluginComponentDefinition,
  PLUGIN_COMPONENT_TYPE,
  PluginComponentType
} from '@xpert-ai/cloud/state'
import {
  I18nObject,
  IconDefinition,
  PLUGIN_LEVEL,
  PluginMarketplaceTrialShortcut,
  PluginMeta,
  XpertTypeEnum
} from '@xpert-ai/contracts'
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
import { PluginMarketplaceSkillDetailDialogComponent } from './marketplace-skill-detail-dialog.component'
import { PluginSkillTrialLauncherService } from './plugin-skill-trial-launcher.service'

type TAppSetupAction =
  | { type: 'install-app'; resource: TPluginResourceContribution }
  | { type: 'initialize-template'; template: TPluginMarketplaceContribution }
  | { type: 'select-template' }
  | { type: 'details' }

type TTrialShortcutView = {
  id: string
  labelValue: string | I18nObject
  prompt: string
  skillLabel: string
  color?: string | null
  icon?: IconDefinition | null
  resource: TPluginResourceContribution
}

export type PluginMarketplaceDetailDialogData = {
  plugin: TPluginWithDownloads
  showActions?: boolean
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    NgmI18nPipe,
    NgmSpinComponent,
    IconComponent,
    ZardBadgeComponent,
    ZardButtonComponent
  ],
  selector: 'xp-plugin-marketplace-detail',
  templateUrl: './marketplace-detail.component.html',
  styleUrls: ['./marketplace-detail.component.scss']
})
export class PluginMarketplaceDetailComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #pluginAPI = injectPluginAPI()
  readonly #trialLauncher = inject(PluginSkillTrialLauncherService)
  readonly #toastr = injectToastr()
  readonly #data = inject<PluginMarketplaceDetailDialogData>(DIALOG_DATA)

  readonly plugin = signal(this.#data.plugin)
  readonly showActions = this.#data.showActions !== false
  readonly marketplaceContents = computed(() => this.plugin()?.contributions ?? [])
  readonly appContents = computed(() => this.marketplaceContents().filter((content) => content.type === 'app'))
  readonly assistantTemplateContents = computed(() =>
    this.marketplaceContents().filter((content) => this.isAssistantTemplate(content))
  )
  readonly contents = computed(() => this.marketplaceContents().filter((content) => this.isPrimaryContent(content)))
  readonly selectedApp = signal<TPluginMarketplaceContribution | null>(
    this.#data.plugin?.contributions?.find((content) => content.type === 'app') ?? null
  )
  readonly trialSubmitting = signal(false)
  readonly activeTrialShortcutId = signal<string | null>(null)

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
  readonly trialShortcuts = computed(() => this.resolveTrialShortcuts())
  readonly trialCardBackgroundImage = computed(() => toCssBackgroundImage(resolveTrialCardImage(this.plugin())))

  close(result?: unknown) {
    this.#dialogRef.close(result)
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
    const declaredResource = this.declaredResourceContribution(content)
    if (!declaredResource) {
      return null
    }

    const component = this.componentDefinitionMap().get(
      this.componentDefinitionKey(declaredResource.componentType, content.name)
    )
    if (!component) {
      return this.canShowDeclaredResourceWithoutComponent(declaredResource) ? declaredResource : null
    }

    return component.componentType === declaredResource.componentType ? declaredResource : null
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

  openContentDetail(content: TPluginMarketplaceContribution, event?: Event) {
    const resource = this.resourceContribution(content)
    if (resource?.type === 'skill') {
      this.openSkillDetail(resource, content, event)
    }
  }

  openSkillDetail(resource: TPluginResourceContribution, content: TPluginMarketplaceContribution, event?: Event) {
    event?.stopPropagation()
    const plugin = this.plugin()
    if (!plugin?.installed || resource.type !== 'skill') {
      return
    }

    const component = this.componentDefinitionMap().get(
      this.componentDefinitionKey(resource.componentType, resource.name)
    )
    if (!component) {
      return
    }

    this.#dialog
      .open(PluginMarketplaceSkillDetailDialogComponent, {
        data: {
          plugin,
          content,
          resource,
          component
        },
        backdropClass: 'backdrop-blur-sm-black'
      })
      .closed.subscribe((result) => {
        if (isTrialStartedDialogResult(result)) {
          this.close()
        }
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

  async tryShortcut(shortcut: TTrialShortcutView, event?: MouseEvent) {
    event?.stopPropagation()
    if (this.trialSubmitting()) {
      return
    }

    const plugin = this.plugin()
    if (!plugin?.installed) {
      return
    }

    this.trialSubmitting.set(true)
    this.activeTrialShortcutId.set(shortcut.id)
    try {
      const started = await this.#trialLauncher.tryInClawXpert({
        plugin,
        resource: shortcut.resource,
        label: shortcut.skillLabel,
        prompt: shortcut.prompt
      })
      if (started) {
        this.close({ action: 'trial-started' })
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to try this skill in ClawXpert.')
    } finally {
      this.trialSubmitting.set(false)
      this.activeTrialShortcutId.set(null)
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
    if (content.type === 'assistant-template') {
      return true
    }
    if (content.type === 'skill') {
      return !!this.declaredResourceContribution(content)
    }
    return !!this.resourceContribution(content)
  }

  private declaredResourceContribution(content: TPluginMarketplaceContribution): TPluginResourceContribution | null {
    const componentType = marketplaceComponentType(content.type)
    if (!componentType) {
      return null
    }

    switch (content.type) {
      case 'skill':
        return {
          ...content,
          type: 'skill',
          componentType
        }
      case 'tool':
        return {
          ...content,
          type: 'tool',
          componentType
        }
      case 'app':
        return {
          ...content,
          type: 'app',
          componentType
        }
      case 'hook':
        return {
          ...content,
          type: 'hook',
          componentType
        }
      default:
        return null
    }
  }

  private canShowDeclaredResourceWithoutComponent(resource: TPluginResourceContribution) {
    return !this.plugin()?.installed && resource.type === 'skill'
  }

  private resolveTrialShortcuts(): TTrialShortcutView[] {
    const plugin = this.plugin()
    if (!plugin?.installed) {
      return []
    }

    const skillResources = this.marketplaceContents()
      .map((content) => ({
        content,
        resource: this.resourceContribution(content)
      }))
      .filter(
        (entry): entry is { content: TPluginMarketplaceContribution; resource: TPluginResourceContribution } =>
          entry.resource?.type === 'skill'
      )
    const defaultSkill = skillResources.length === 1 ? skillResources[0] : null
    const shortcuts: TTrialShortcutView[] = []

    for (const [index, shortcut] of getTrialShortcutCandidates(plugin).entries()) {
      const prompt = readString(shortcut.prompt)
      if (!prompt) {
        continue
      }

      const skillKey = readString(shortcut.skillKey)
      const target = skillKey
        ? skillResources.find((entry) => entry.resource.name === skillKey || entry.content.name === skillKey)
        : defaultSkill
      if (!target) {
        continue
      }

      const id = readString(shortcut.id) ?? `${target.resource.name}:${index}:${prompt}`
      const skillLabel = readI18nText(target.content.displayName ?? target.content.name) ?? target.content.name
      shortcuts.push({
        id,
        labelValue: shortcut.label ?? prompt,
        prompt,
        skillLabel,
        color: readContributionColor(target.content),
        icon: shortcut.icon ?? target.content.icon ?? plugin.icon,
        resource: target.resource
      })

      if (shortcuts.length >= 3) {
        break
      }
    }

    return shortcuts
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

function readContributionColor(content: TPluginMarketplaceContribution) {
  return readString(content.color) ?? readString(content.metadata?.['color'])
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter((item): item is string => !!item) : []
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

function getTrialShortcutCandidates(plugin: TPluginWithDownloads): PluginMarketplaceTrialShortcut[] {
  const structured = readTargetAppMarketplaceTrialShortcuts(plugin)
  if (structured.length) {
    return structured
  }

  return readStringArray(plugin.defaultPrompt).map((prompt, index) => ({
    id: `default-${index + 1}`,
    prompt
  }))
}

function readTargetAppMarketplaceTrialShortcuts(plugin: TPluginWithDownloads) {
  const targetAppMeta = plugin.targetAppMeta ?? {}
  const xpertShortcuts = targetAppMeta['xpert']?.marketplace?.trialShortcuts
  if (xpertShortcuts?.length) {
    return xpertShortcuts
  }

  if (plugin.trialShortcuts?.length) {
    return plugin.trialShortcuts
  }

  return Object.values(targetAppMeta).flatMap((metadata) => metadata?.marketplace?.trialShortcuts ?? [])
}

function resolveTrialCardImage(plugin: TPluginWithDownloads | null | undefined) {
  if (!plugin) {
    return null
  }

  const targetAppMeta = plugin.targetAppMeta ?? {}
  return (
    readFirstSafeImageUrl(targetAppMeta['xpert']?.marketplace?.screenshots) ??
    readFirstSafeImageUrl(
      Object.values(targetAppMeta).flatMap((metadata) => metadata?.marketplace?.screenshots ?? [])
    ) ??
    readFirstSafeImageUrl(plugin.screenshots)
  )
}

function readFirstSafeImageUrl(value: unknown) {
  return readStringArray(value).find(isSafeImageUrl) ?? null
}

function isSafeImageUrl(value: string) {
  return /^(https?:\/\/|\/(?!\/)|\.{0,2}\/|assets\/|data:image\/)/i.test(value)
}

function toCssBackgroundImage(value: string | null) {
  return value ? `url("${value.replace(/["\\]/g, '\\$&')}")` : null
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

function isTrialStartedDialogResult(value: unknown): value is { action: 'trial-started' } {
  return !!value && typeof value === 'object' && Reflect.get(value, 'action') === 'trial-started'
}
