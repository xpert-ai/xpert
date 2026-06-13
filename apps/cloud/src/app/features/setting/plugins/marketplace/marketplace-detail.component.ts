import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { I18nObject, XpertTypeEnum } from '@cloud/app/@core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PLUGIN_COMPONENT_TYPE } from '@xpert-ai/cloud/state'
import { PLUGIN_LEVEL, PluginMeta } from '@xpert-ai/contracts'
import { ZardBadgeComponent } from '@xpert-ai/headless-ui'
import { BlankXpertWizardResult, XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
import { PluginResourcesComponent } from '../resources/resources.component'
import {
  TInstalledPlugin,
  TPluginMarketplaceContribution,
  TPluginMarketplaceOperation,
  TPluginResourceContribution,
  TPluginWithDownloads
} from '../types'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmI18nPipe, IconComponent, ZardBadgeComponent],
  selector: 'xp-plugin-marketplace-detail',
  templateUrl: './marketplace-detail.component.html',
  styleUrls: ['./marketplace-detail.component.scss']
})
export class PluginMarketplaceDetailComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #data = inject<{ plugin: TPluginWithDownloads }>(DIALOG_DATA)

  readonly plugin = signal(this.#data.plugin)
  readonly contents = computed(() => this.plugin()?.contributions ?? [])
  readonly selectedApp = signal<TPluginMarketplaceContribution | null>(
    this.#data.plugin?.contributions?.find((content) => content.type === 'app') ?? null
  )
  readonly operationGroups: Array<'read' | 'write' | 'admin'> = ['read', 'write', 'admin']

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
    switch (content.type) {
      case 'skill':
        return {
          ...content,
          type: 'skill',
          componentType: PLUGIN_COMPONENT_TYPE.SKILL
        }
      case 'tool':
        return {
          ...content,
          type: 'tool',
          componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER
        }
      case 'app':
        return {
          ...content,
          type: 'app',
          componentType: PLUGIN_COMPONENT_TYPE.APP
        }
      case 'hook':
        return {
          ...content,
          type: 'hook',
          componentType: PLUGIN_COMPONENT_TYPE.HOOK
        }
      default:
        return null
    }
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

  contentTypeIcon(type: string) {
    switch (type) {
      case 'app':
        return 'ri-apps-2-line'
      case 'view':
        return 'ri-layout-4-line'
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

  operations(access: string): TPluginMarketplaceOperation[] {
    return (this.selectedApp()?.operations ?? []).filter((operation) => operation.access === access)
  }

  operationCount() {
    return this.selectedApp()?.operations?.length ?? 0
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
    const pluginName =
      readString(plugin?.marketplacePlugin?.['packageName']) ??
      readString(plugin?.marketplacePlugin?.['name']) ??
      readString(plugin?.packageName) ??
      readString(plugin?.name)
    return pluginName ? `${pluginName}:${templateKey}` : templateKey
  }

  private resolveInstalledPluginName() {
    const plugin = this.plugin()
    return (
      readString(plugin?.marketplacePlugin?.['packageName']) ??
      readString(plugin?.marketplacePlugin?.['name']) ??
      readString(plugin?.packageName) ??
      readString(plugin?.name)
    )
  }

  private installModeForResource(content: TPluginResourceContribution) {
    return content.componentType === PLUGIN_COMPONENT_TYPE.HOOK ? 'xpert' : 'workspace'
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
