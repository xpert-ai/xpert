import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'

import { ChangeDetectionStrategy, Component, computed, inject, model, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { ZardInputDirective, ZardStepperImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import {
  IDocumentChunkerProvider,
  IDocumentProcessorProvider,
  IDocumentSourceProvider,
  IDocumentUnderstandingProvider,
  getErrorMessage,
  ICopilotModel,
  IXpert,
  IXpertWorkspace,
  KnowledgebaseService,
  TAgentMiddlewareMeta,
  TAvatar,
  ToastrService,
  TWorkflowTriggerMeta,
  XpertAgentService,
  XpertAPIService,
  XpertTypeEnum
} from '../../../../@core'
import { genAgentKey } from '../../utils'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { catchError, from, map, of, switchMap } from 'rxjs'
import {
  buildBlankKnowledgeDraft,
  buildBlankXpertDraft,
  hasBlankWizardSelections
} from './blank-draft.util'

type BlankTriggerProviderOption = Pick<TWorkflowTriggerMeta, 'name' | 'label'>

const CHAT_TRIGGER_PROVIDER: BlankTriggerProviderOption = {
  name: 'chat',
  label: {
    en_US: 'Chat',
    zh_Hans: '聊天'
  }
}

@Component({
  selector: 'xpert-new-blank',
  standalone: true,
  imports: [
    TranslateModule,
    DragDropModule,
    ZardInputDirective,
    ...ZardStepperImports,
    FormsModule,
    CdkListboxModule,
    NgmI18nPipe,
    NgmSpinComponent,
    XpertBasicFormComponent
],
  templateUrl: './blank.component.html',
  styleUrl: './blank.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertNewBlankComponent {
  eXpertTypeEnum = XpertTypeEnum
  readonly #dialogRef = inject(DialogRef<IXpert>)
  readonly #dialogData = inject<{ workspace: IXpertWorkspace; type: XpertTypeEnum }>(DIALOG_DATA)
  readonly xpertService = inject(XpertAPIService)
  readonly xpertAgentService = inject(XpertAgentService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)
  readonly basicForm = viewChild(XpertBasicFormComponent)

  readonly type = signal(this.#dialogData.type ?? null)
  readonly types = model<XpertTypeEnum[]>([this.#dialogData.type ?? XpertTypeEnum.Agent])
  readonly name = model<string>()
  readonly description = model<string>()
  readonly avatar = model<TAvatar>()
  readonly title = model<string>()
  readonly copilotModel = model<ICopilotModel>()
  readonly triggerProviders = toSignal(this.xpertService.getTriggerProviders(), { initialValue: [] as TWorkflowTriggerMeta[] })
  readonly middlewareProviders = toSignal(this.xpertAgentService.agentMiddlewares$, {
    initialValue: [] as { meta: TAgentMiddlewareMeta }[]
  })
  readonly dataSourceProviders = toSignal(this.knowledgebaseService.documentSourceStrategies$, {
    initialValue: [] as { meta: IDocumentSourceProvider; integration: { service: string } }[]
  })
  readonly processorProviders = toSignal(this.knowledgebaseService.documentTransformerStrategies$, {
    initialValue: [] as { meta: IDocumentProcessorProvider; integration: { service: string } }[]
  })
  readonly chunkerProviders = toSignal(this.knowledgebaseService.textSplitterStrategies$, {
    initialValue: [] as IDocumentChunkerProvider[]
  })
  readonly understandingProviders = toSignal(this.knowledgebaseService.understandingStrategies$, {
    initialValue: [] as { meta: IDocumentUnderstandingProvider; requireVisionModel: boolean; integration: { service: string } }[]
  })
  readonly triggerProviderOptions = computed(() =>
    uniqueByName<BlankTriggerProviderOption>([CHAT_TRIGGER_PROVIDER, ...this.triggerProviders()], (provider) => provider.name)
  )
  readonly middlewareProviderOptions = computed(() =>
    uniqueByName<{ meta: TAgentMiddlewareMeta }>(this.middlewareProviders(), (provider) => provider.meta.name)
  )
  readonly dataSourceProviderOptions = computed(() =>
    uniqueByName<{ meta: IDocumentSourceProvider; integration: { service: string } }>(
      this.dataSourceProviders(),
      (provider) => provider.meta.name
    )
  )
  readonly processorProviderOptions = computed(() =>
    uniqueByName<{ meta: IDocumentProcessorProvider; integration: { service: string } }>(
      this.processorProviders(),
      (provider) => provider.meta.name
    )
  )
  readonly chunkerProviderOptions = computed(() =>
    uniqueByName<IDocumentChunkerProvider>(this.chunkerProviders(), (provider) => provider.name)
  )
  readonly understandingProviderOptions = computed(() =>
    uniqueByName<{ meta: IDocumentUnderstandingProvider; requireVisionModel: boolean; integration: { service: string } }>(
      this.understandingProviders(),
      (provider) => provider.meta.name
    )
  )
  readonly skillInput = model<string>('')
  readonly selectedTriggers = model<string[]>([])
  readonly selectedSkills = model<string[]>([])
  readonly selectedMiddlewares = model<string[]>([])
  readonly selectedKnowledgeTriggers = model<string[]>([])
  readonly selectedDataSources = model<string[]>([])
  readonly selectedProcessors = model<string[]>([])
  readonly selectedChunkers = model<string[]>([])
  readonly selectedUnderstandings = model<string[]>([])
  readonly selectedType = computed(() => this.types()[0] ?? XpertTypeEnum.Agent)
  readonly isAgentType = computed(() => this.selectedType() === XpertTypeEnum.Agent)
  readonly isKnowledgeType = computed(() => this.selectedType() === XpertTypeEnum.Knowledge)
  readonly basicInvalid = computed(() => {
    const basicForm = this.basicForm()
    return !basicForm || basicForm.checking() || basicForm.invalid()
  })
  readonly hasAdvancedSelections = computed(() =>
    hasBlankWizardSelections({
      triggerProviders: this.selectedTriggers(),
      skills: this.selectedSkills(),
      middlewares: this.selectedMiddlewares()
    })
  )

  readonly loading = signal(false)

  create() {
    this.loading.set(true)
    const selectedType = this.selectedType()
    this.xpertService
      .create({
        type: selectedType,
        name: this.name(),
        title: this.title(),
        description: this.description(),
        copilotModel: this.copilotModel(),
        latest: true,
        workspaceId: this.#dialogData?.workspace?.id,
        avatar: this.avatar(),
        agent: {
          key: genAgentKey(),
          avatar: this.avatar(),
          options: {
            ...(selectedType === XpertTypeEnum.Knowledge
              ? {
                  hidden: true
                }
              : {}),
            vision: {
              enabled: true
            }
          }
        }
      })
      .pipe(
        switchMap((xpert) => this.initializeDraftIfNeeded(xpert))
      )
      .subscribe({
        next: (xpert) => {
          this.loading.set(false)
          this.#toastr.success(`PAC.Messages.CreatedSuccessfully`, { Default: 'Created Successfully' })
          this.close(xpert)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  toggleTrigger(provider: string, enabled: boolean) {
    this.selectedTriggers.set(this.toggleValue(this.selectedTriggers(), provider, enabled))
  }

  toggleMiddleware(provider: string, enabled: boolean) {
    this.selectedMiddlewares.set(this.toggleValue(this.selectedMiddlewares(), provider, enabled))
  }

  toggleKnowledgeTrigger(provider: string, enabled: boolean) {
    this.selectedKnowledgeTriggers.set(this.toggleValue(this.selectedKnowledgeTriggers(), provider, enabled))
  }

  toggleDataSource(provider: string, enabled: boolean) {
    this.selectedDataSources.set(this.toggleValue(this.selectedDataSources(), provider, enabled))
  }

  toggleProcessor(provider: string, enabled: boolean) {
    this.selectedProcessors.set(this.toggleValue(this.selectedProcessors(), provider, enabled))
  }

  toggleChunker(provider: string, enabled: boolean) {
    this.selectedChunkers.set(this.toggleValue(this.selectedChunkers(), provider, enabled))
  }

  toggleUnderstanding(provider: string, enabled: boolean) {
    this.selectedUnderstandings.set(this.toggleValue(this.selectedUnderstandings(), provider, enabled))
  }

  addSkill(event?: Event) {
    event?.preventDefault()
    const nextSkills = this.parseSkillInput(this.skillInput())
    if (!nextSkills.length) {
      return
    }

    this.selectedSkills.set(Array.from(new Set([...this.selectedSkills(), ...nextSkills])))
    this.skillInput.set('')
  }

  removeSkill(skill: string) {
    this.selectedSkills.set(this.selectedSkills().filter((item) => item !== skill))
  }

  onSkillInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      this.addSkill(event)
    }
  }

  close(value?: IXpert) {
    this.#dialogRef.close(value)
  }

  private initializeDraftIfNeeded(xpert: IXpert) {
    if (this.isKnowledgeType()) {
      return from(buildBlankKnowledgeDraft(xpert, this.getKnowledgeSelections())).pipe(
        switchMap((draft) => this.xpertService.saveDraft(xpert.id, draft)),
        map(() => xpert),
        catchError((error) => {
          this.#toastr.warning('PAC.Xpert.PreconfigurationNotSaved', {
            Default: 'Expert created, but the preconfiguration could not be saved. You can continue in Studio.'
          })
          console.error(error)
          return of(xpert)
        })
      )
    }

    if (!this.isAgentType() || !this.hasAdvancedSelections()) {
      return of(xpert)
    }

    return this.getDraftTeam(xpert).pipe(
      switchMap((team) =>
        from(buildBlankXpertDraft(team, this.getSelections())).pipe(
          switchMap((draft) => this.xpertService.saveDraft(xpert.id, draft)),
          map(() => xpert)
        )
      ),
      catchError((error) => {
        this.#toastr.warning('PAC.Xpert.PreconfigurationNotSaved', {
          Default: 'Expert created, but the preconfiguration could not be saved. You can continue in Studio.'
        })
        console.error(error)
        return of(xpert)
      })
    )
  }

  private getDraftTeam(xpert: IXpert) {
    if (xpert.agent?.key) {
      return of(xpert)
    }

    return this.xpertService.getTeam(xpert.id, { relations: ['agent'] })
  }

  private getSelections() {
    return {
      triggerProviders: this.selectedTriggers(),
      skills: this.selectedSkills(),
      middlewares: this.selectedMiddlewares()
    }
  }

  private getKnowledgeSelections() {
    return {
      triggerProviders: this.selectedKnowledgeTriggers(),
      sourceProviders: this.selectedDataSources(),
      processorProviders: this.selectedProcessors(),
      chunkerProviders: this.selectedChunkers(),
      understandingProviders: this.selectedUnderstandings()
    }
  }

  private parseSkillInput(value: string) {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  private toggleValue(values: string[], value: string, enabled: boolean) {
    if (enabled) {
      return values.includes(value) ? values : [...values, value]
    }

    return values.filter((item) => item !== value)
  }
}

function uniqueByName<T>(values: T[], getName: (value: T) => string) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const name = getName(value)
    if (!name || seen.has(name)) {
      return false
    }

    seen.add(name)
    return true
  })
}
