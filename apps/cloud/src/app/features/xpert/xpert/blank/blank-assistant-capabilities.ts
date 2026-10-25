import { Injectable, computed, inject, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ICopilotModel, IXpert, XpertTemplateSetup } from '@xpert-ai/contracts'
import { firstValueFrom, take } from 'rxjs'
import { XpertAPIService } from '@cloud/app/@core/services/xpert.service'
import { XpertTemplateService } from '@cloud/app/@core/services/xpert-template.service'
import { getErrorMessage } from '@cloud/app/@core/types'

const blankTemplate = 'xpert-blank-assistant'

/** Plugin providers opt into quick creation; all composition and authorization remain on the server. */
@Injectable()
export class BlankAssistantCapabilities {
  private readonly templates = inject(XpertTemplateService)
  private readonly assistants = inject(XpertAPIService)
  private readonly translate = inject(TranslateService)
  readonly selected = signal<string[]>([])
  readonly enabled = computed(() => this.selected().length > 0)
  readonly loading = signal(false)
  readonly loaded = signal(false)
  readonly options = signal<XpertTemplateSetup['optionalCapabilities']>([])
  readonly error = signal<string | null>(null)

  toggle(key: string, checked: boolean) {
    if (!this.options().some((option) => option.key === key)) return
    this.selected.update((keys) => (checked ? [...new Set([...keys, key])] : keys.filter((entry) => entry !== key)))
  }

  async load() {
    if (this.loading() || this.loaded()) return
    this.loading.set(true)
    this.error.set(null)
    try {
      const setup = await firstValueFrom(this.templates.getSetup(blankTemplate).pipe(take(1)))
      this.options.set(setup.optionalCapabilities.filter((entry) => entry.supportsQuickCreation === true))
      this.loaded.set(true)
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  async validate(model: ICopilotModel | null | undefined) {
    if (!this.enabled()) return
    const selected = this.selected()
    const setup = await firstValueFrom(this.templates.getSetup(blankTemplate, selected).pipe(take(1)))
    if (!setup.canInstall) throw new Error(setup.reason)
    if (
      !selected.every((key) =>
        setup.optionalCapabilities.some((entry) => entry.key === key && entry.supportsQuickCreation)
      )
    )
      throw new Error(this.translate.instant('XP.Xpert.QuickCapabilities.Unavailable'))
    if (
      setup.requiresModel !== false &&
      !setup.models.some(
        (entry) => entry.copilotModel.copilotId === model?.copilotId && entry.copilotModel.model === model?.model
      )
    )
      throw new Error(this.translate.instant('XP.Xpert.QuickCapabilities.ModelRequired'))
  }

  async apply(xpert: IXpert): Promise<IXpert> {
    if (!this.enabled()) return xpert
    const selected = this.selected()
    const configuration = await firstValueFrom(this.assistants.getAssistantCapabilities(xpert.id).pipe(take(1)))
    if (!selected.every((key) => configuration.options.some((entry) => entry.key === key && entry.available)))
      throw new Error(this.translate.instant('XP.Xpert.QuickCapabilities.Unavailable'))
    const draft = await firstValueFrom(
      this.assistants
        .previewAssistantCapabilities(xpert.id, {
          revision: configuration.revision,
          capabilities: [...new Set([...configuration.selected, ...selected])]
        })
        .pipe(take(1))
    )
    const saved = await firstValueFrom(this.assistants.saveDraft(xpert.id, draft).pipe(take(1)))
    return { ...xpert, draft: saved }
  }
}
