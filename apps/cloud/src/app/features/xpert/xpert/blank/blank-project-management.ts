import { Injectable, inject, signal } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { ICopilotModel, IXpert, XpertTemplateSetup } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { XpertAPIService } from '@cloud/app/@core/services/xpert.service'
import { XpertTemplateService } from '@cloud/app/@core/services/xpert-template.service'
import { getErrorMessage } from '@cloud/app/@core/types'

const capability = 'project-tasks'
const blankTemplate = 'xpert-blank-assistant'

/** Uses the same governed capability composition as Desktop and Assistant settings. */
@Injectable()
export class BlankProjectManagement {
  private readonly templates = inject(XpertTemplateService)
  private readonly assistants = inject(XpertAPIService)
  private readonly translate = inject(TranslateService)
  readonly enabled = signal(false)
  readonly loading = signal(false)
  readonly loaded = signal(false)
  readonly option = signal<XpertTemplateSetup['optionalCapabilities'][number] | null>(null)
  readonly error = signal<string | null>(null)

  async load() {
    if (this.loading() || this.loaded()) return
    this.loading.set(true)
    this.error.set(null)
    try {
      const setup = await firstValueFrom(this.templates.getSetup(blankTemplate))
      this.option.set(setup.optionalCapabilities.find((entry) => entry.key === capability) ?? null)
      this.loaded.set(true)
      if (!this.option()) this.error.set(this.translate.instant('XP.Xpert.ProjectManagement.Unavailable'))
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  async validate(model: ICopilotModel | null | undefined) {
    if (!this.enabled()) return
    const setup = await firstValueFrom(this.templates.getSetup(blankTemplate, [capability]))
    if (!setup.canInstall) throw new Error(setup.reason)
    if (!setup.optionalCapabilities.some((entry) => entry.key === capability))
      throw new Error(this.translate.instant('XP.Xpert.ProjectManagement.Unavailable'))
    if (
      !setup.models.some(
        (entry) => entry.copilotModel.copilotId === model?.copilotId && entry.copilotModel.model === model?.model
      )
    )
      throw new Error(this.translate.instant('XP.Xpert.ProjectManagement.ModelRequired'))
  }

  async apply(xpert: IXpert): Promise<IXpert> {
    if (!this.enabled()) return xpert
    const configuration = await firstValueFrom(this.assistants.getAssistantCapabilities(xpert.id))
    if (!configuration.options.some((entry) => entry.key === capability && entry.available))
      throw new Error(this.translate.instant('XP.Xpert.ProjectManagement.Unavailable'))
    const draft = await firstValueFrom(
      this.assistants.previewAssistantCapabilities(xpert.id, {
        revision: configuration.revision,
        capabilities: [...new Set([...configuration.selected, capability])]
      })
    )
    const saved = await firstValueFrom(this.assistants.saveDraft(xpert.id, draft))
    return { ...xpert, draft: saved }
  }
}
