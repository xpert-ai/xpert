import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { XpertTypeEnum } from '@cloud/app/@core'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BlankXpertWizardResult, XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
import { TPluginMarketplaceContribution, TPluginMarketplaceOperation, TPluginWithDownloads } from '../types'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmI18nPipe, IconComponent],
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
      case 'feature':
        return 'ri-sparkling-2-line'
      case 'tool':
        return 'ri-tools-line'
      default:
        return 'ri-puzzle-2-line'
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
      readString((plugin as Record<string, unknown> | undefined)?.['packageName']) ??
      readString(plugin?.name) ??
      readString(plugin?.marketplacePlugin?.['packageName']) ??
      readString(plugin?.marketplacePlugin?.['name'])
    return pluginName ? `${pluginName}:${templateKey}` : templateKey
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
