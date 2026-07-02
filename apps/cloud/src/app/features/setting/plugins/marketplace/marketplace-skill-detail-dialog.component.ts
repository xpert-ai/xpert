import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar/icon/icon.component'
import { type IPluginComponentDefinition, type IPluginComponentDocument, injectPluginAPI } from '@xpert-ai/cloud/state'
import { type I18nObject, type IconDefinition } from '@xpert-ai/contracts'
import { ZardBadgeComponent, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { myRxResource, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { of } from 'rxjs'
import {
  type TPluginMarketplaceContribution,
  type TPluginResourceContribution,
  type TPluginWithDownloads
} from '../types'
import { PluginSkillTrialLauncherService } from './plugin-skill-trial-launcher.service'

type PluginMarketplaceSkillDetailDialogData = {
  plugin: TPluginWithDownloads
  content: TPluginMarketplaceContribution
  resource: TPluginResourceContribution
  component: IPluginComponentDefinition
}

const DEFAULT_SKILL_ICON = {
  type: 'font',
  value: 'ri-puzzle-line'
} satisfies IconDefinition

@Component({
  standalone: true,
  selector: 'xp-plugin-marketplace-skill-detail-dialog',
  imports: [
    CommonModule,
    TranslateModule,
    MarkdownModule,
    NgmI18nPipe,
    NgmSpinComponent,
    IconComponent,
    ZardBadgeComponent,
    ZardButtonComponent
  ],
  templateUrl: './marketplace-skill-detail-dialog.component.html',
  styleUrls: ['./marketplace-skill-detail-dialog.component.scss']
})
export class PluginMarketplaceSkillDetailDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #pluginAPI = injectPluginAPI()
  readonly #trialLauncher = inject(PluginSkillTrialLauncherService)
  readonly #toastr = injectToastr()
  readonly #data = inject<PluginMarketplaceSkillDetailDialogData>(DIALOG_DATA)

  readonly skillMarkdown = viewChild<ElementRef<HTMLElement>>('skillMarkdown')
  readonly plugin = signal(this.#data.plugin)
  readonly content = signal(this.#data.content)
  readonly resource = signal(this.#data.resource)
  readonly component = signal(this.#data.component)
  readonly trialSubmitting = signal(false)

  readonly pluginName = computed(() => readString(this.plugin()?.packageName) ?? readString(this.plugin()?.name))
  readonly titleValue = computed(() => this.content().displayName ?? this.content().name)
  readonly title = computed(() => readI18nText(this.titleValue()) ?? this.content().name)
  readonly descriptionValue = computed(() => this.content().description ?? this.plugin()?.description ?? '')
  readonly description = computed(() => readI18nText(this.descriptionValue()) ?? '')
  readonly icon = computed(() => this.content().icon ?? this.plugin()?.icon ?? DEFAULT_SKILL_ICON)

  readonly #document = myRxResource({
    request: () => {
      const pluginName = this.pluginName()
      const componentKey = this.resource().name
      return pluginName && componentKey ? { pluginName, componentKey } : null
    },
    loader: ({ request }) =>
      request
        ? this.#pluginAPI.getPluginSkillDocument(request.pluginName, request.componentKey)
        : of(null as IPluginComponentDocument | null)
  })

  readonly document = computed(() => this.#document.value() ?? null)
  readonly documentLoading = computed(() => this.#document.status() === 'loading')
  readonly documentError = computed(() => {
    const error = this.#document.error()
    return error ? getErrorMessage(error) : null
  })

  close(result?: unknown) {
    if (!this.trialSubmitting()) {
      this.#dialogRef.close(result)
    }
  }

  normalizeMarkdownLinks() {
    const element = this.skillMarkdown()?.nativeElement
    if (!element) {
      return
    }

    for (const anchor of Array.from(element.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      const href = anchor.getAttribute('href')?.trim()
      if (!href || isUnsafeMarkdownHref(href)) {
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

      if (isExternalMarkdownHref(href)) {
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

  installToWorkspace(event?: MouseEvent) {
    event?.stopPropagation()
    void this.#trialLauncher.openInstallDialog({
      plugin: this.plugin(),
      resource: this.resource(),
      closeOnSuccess: false
    })
  }

  async tryInClawXpert(event?: MouseEvent) {
    event?.stopPropagation()
    if (this.trialSubmitting()) {
      return
    }

    this.trialSubmitting.set(true)
    try {
      const started = await this.#trialLauncher.tryInClawXpert({
        plugin: this.plugin(),
        resource: this.resource(),
        label: this.title()
      })
      if (started) {
        this.#dialogRef.close({ action: 'trial-started' })
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || 'Failed to try this skill in ClawXpert.')
    } finally {
      this.trialSubmitting.set(false)
    }
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
    readString(value.zh_Hans) ??
    readString(value.en_US) ??
    Object.values(value).find((item): item is string => typeof item === 'string' && !!item.trim()) ??
    null
  )
}

function isUnsafeMarkdownHref(href: string) {
  return /^(javascript|data|vbscript):/i.test(href.replace(/\s+/g, ''))
}

function isExternalMarkdownHref(href: string) {
  return /^(https?:)?\/\//i.test(href)
}
