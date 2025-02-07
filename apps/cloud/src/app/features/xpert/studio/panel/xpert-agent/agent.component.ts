import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ICopilotModel,
  IfAnimation,
  IXpertAgent,
  IXpertAgentExecution,
  AiModelTypeEnum,
  OrderTypeEnum,
  TAvatar,
  TXpertParameter,
  XpertAgentExecutionService,
  XpertService,
  agentUniqueName,
  injectToastr,
  getErrorMessage,
  DateRelativePipe,
  TAgentOutputVariable,
  uuid,
  TVariableAssigner,
  XpertAgentService,
  TXpertAgentOptions,
  injectHelpWebsite
} from 'apps/cloud/src/app/@core'
import { AppService } from 'apps/cloud/src/app/app.service'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioPanelAgentExecutionComponent } from '../agent-execution/execution.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertStudioPanelToolsetSectionComponent } from './toolset-section/toolset.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, catchError, map, of, shareReplay, startWith, switchMap } from 'rxjs'
import { CdkMenuModule } from '@angular/cdk/menu'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioPanelKnowledgeSectionComponent } from './knowledge-section/knowledge.component'
import { CopilotModelSelectComponent, CopilotPromptEditorComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertOutputVariablesEditComponent, XpertParametersEditComponent, XpertVariablesAssignerComponent } from 'apps/cloud/src/app/@shared/xpert'
import { MatTooltipModule } from '@angular/material/tooltip'
import { uniq } from 'lodash-es'
import { XpertStudioComponent } from '../../studio.component'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { OverlayAnimations } from '@metad/core'
import { MatSliderModule } from '@angular/material/slider'
import { XpertErrorHandlingComponent } from './error-handling/error-handling.component'

@Component({
  selector: 'xpert-studio-panel-agent',
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    MatSlideToggleModule,
    MatSliderModule,
    DateRelativePipe,

    NgmDensityDirective,
    NgmSpinComponent,
    EmojiAvatarComponent,
    XpertStudioPanelToolsetSectionComponent,
    CopilotModelSelectComponent,
    XpertStudioPanelAgentExecutionComponent,
    XpertParametersEditComponent,
    CopilotPromptEditorComponent,
    XpertStudioPanelKnowledgeSectionComponent,
    XpertOutputVariablesEditComponent,
    XpertVariablesAssignerComponent,
    XpertErrorHandlingComponent
  ],
  host: {
    tabindex: '-1',
  },
  animations: [IfAnimation, ...OverlayAnimations]
})
export class XpertStudioPanelAgentComponent {
  eModelType = AiModelTypeEnum

  readonly regex = `{{(.*?)}}`
  readonly elementRef = inject(ElementRef)
  readonly appService = inject(AppService)
  readonly apiService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly agentService = inject(XpertAgentService)
  readonly executionService = inject(XpertAgentExecutionService)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly #toastr = injectToastr()
  readonly helpWebsite = injectHelpWebsite()

  readonly key = input<string>()
  readonly nodes = computed(() => this.apiService.viewModel()?.nodes)
  readonly node = computed(() => this.nodes()?.find((_) => _.key === this.key()))
  readonly xpertAgent = computed(() => this.node()?.entity as IXpertAgent)
  readonly promptInputElement = viewChild('editablePrompt', { read: ElementRef<HTMLDivElement> })

  readonly xpert = computed(() => this.apiService.viewModel()?.team)
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly xpertCopilotModel = computed(() => this.xpert()?.copilotModel)
  readonly toolsets = computed(() => this.xpertAgent()?.toolsets)
  readonly name = computed(() => this.xpertAgent()?.name)
  readonly title = computed(() => this.xpertAgent()?.title)
  readonly prompt = model<string>()
  readonly promptLength = computed(() => this.prompt()?.length)
  readonly agentUniqueName = computed(() => agentUniqueName(this.xpertAgent()))
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly isSensitive = computed(() => this.agentConfig()?.interruptBefore?.includes(this.agentUniqueName()))
  readonly isEnd = computed(() => this.agentConfig()?.endNodes?.includes(this.agentUniqueName()))
  readonly disableOutput = computed(() => this.agentConfig()?.disableOutputs?.includes(this.key()))
  readonly enableMessageHistory = computed(() => !this.xpertAgent()?.options?.disableMessageHistory)
  readonly promptTemplates = computed(() => this.xpertAgent()?.promptTemplates)
  readonly isPrimaryAgent = computed(() => !!this.xpertAgent()?.xpertId)

  readonly parameters = computed(() => this.xpertAgent()?.parameters)
  readonly memories = computed(() => this.xpertAgent()?.options?.memories)
  readonly parallelToolCalls = computed(() => this.xpertAgent()?.options?.parallelToolCalls ?? true)

  // Error handling
  readonly retry = computed(() => this.xpertAgent()?.options?.retry)
  readonly retryEnabled = computed(() => this.retry()?.enabled)
  readonly stopAfterAttempt = computed(() => this.retry()?.stopAfterAttempt)
  readonly fallback = computed(() => this.xpertAgent()?.options?.fallback)
  readonly fallbackEnabled = computed(() => this.fallback()?.enabled)
  readonly fallbackModel = computed(() => this.fallback()?.copilotModel)
  readonly errorHandling = computed(() => this.xpertAgent()?.options?.errorHandling)
  readonly errorHandlingType = computed(() => this.errorHandling()?.type)

  readonly nameError = computed(() => {
    const name = this.name()
    if (name) {
      const isValidName = /^[a-zA-Z0-9 _-]+$/.test(name)
      return !isValidName || this.nodes()
        .filter((_) => _.key !== this.key())
        .some((n) => n.type === 'agent' && n.entity.name === name)
    }
    return false
  })

  readonly outputVariables = computed(() => this.xpertAgent()?.outputVariables)
  get enabledOutputVars() {
    return !!this.outputVariables()
  }
  set enabledOutputVars(value: boolean) {
    this.updateOutputVariables(value ? (this.outputVariables() ?? []) : null)
  }

  readonly copilotModel = model<ICopilotModel>()

  readonly openedExecution = signal(false)
  readonly executionId = model<string>(null)

  readonly executions = derivedAsync(() => {
    const xpertId = this.xpertId()
    const agentKey = this.key()
    return this.executionService.findAllByXpertAgent(xpertId, agentKey, {
      order: {
        updatedAt: OrderTypeEnum.DESC
      },
      take: 50
    }).pipe(
      map(({items}) => items)
    )
  })

  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const agentKey = this.key()
    return xpertId && agentKey ? this.xpertService.getVariables(xpertId, agentKey).pipe(
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of([])
      })
    ) : of(null)
  })

  readonly promptTemplateFullscreen = signal<string>(null)

  readonly loading = signal(false)

  // Diagram of agents
  readonly refreshDiagram$ = new BehaviorSubject<void>(null)
  readonly diagram$ = this.refreshDiagram$.pipe(
    switchMap(() => this.xpertService.getDiagram(this.xpert().id, this.key()).pipe(startWith(null))),
    map((imageBlob) => imageBlob ? URL.createObjectURL(imageBlob) : null),
    shareReplay(1)
  )

  constructor() {
    effect(
      () => {
        if (this.xpertAgent()) {
          this.prompt.set(this.xpertAgent().prompt)
          this.copilotModel.set(this.xpertAgent().copilotModel)
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      // console.log(`agent copilotModel:`, this.copilotModel())
    })
  }

  onNameChange(event: string) {
    this.apiService.updateXpertAgent(this.key(), { name: event }, { emitEvent: false })
  }
  onTitleChange(event: string) {
    this.apiService.updateXpertAgent(
      this.key(),
      {
        title: event
      },
      { emitEvent: false }
    )
  }
  onDescChange(event: string) {
    this.apiService.updateXpertAgent(this.key(), { description: event }, { emitEvent: false })
  }
  onBlur() {
    this.apiService.reload()
  }
  onPromptChange(event: string) {
    this.apiService.updateXpertAgent(this.key(), { prompt: event })
  }

  updateCopilotModel(model: ICopilotModel) {
    this.apiService.updateXpertAgent(this.key(), { copilotModel: model })
  }

  updateAvatar(avatar: TAvatar) {
    this.apiService.updateXpertAgent(this.key(), { avatar })
  }

  openExecution(execution?: IXpertAgentExecution) {
    this.executionId.set(execution?.id)
    this.openedExecution.set(true)
  }
  closeExecution() {
    this.openedExecution.set(false)
  }

  closePanel() {
    this.panelComponent.close()
  }

  onParameters(event: TXpertParameter[]) {
    this.apiService.updateXpertAgent(this.key(), { parameters: event })
  }

  updateSensitive(value: boolean) {
    const name = this.agentUniqueName()
    const interruptBefore = value
      ? uniq([...(this.agentConfig()?.interruptBefore ?? []), name])
      : (this.agentConfig()?.interruptBefore?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({ interruptBefore })
  }

  updateEnd(value: boolean) {
    const name = this.agentUniqueName()
    const endNodes = value
      ? uniq([...(this.agentConfig()?.endNodes ?? []), name])
      : (this.agentConfig()?.endNodes?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({ endNodes })
  }

  updateDisableOutput(value: boolean) {
    const name = this.key()
    const disableOutputs = value
      ? uniq([...(this.agentConfig()?.disableOutputs ?? []), name])
      : (this.agentConfig()?.disableOutputs?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({ disableOutputs })
  }

  updateParallelToolCalls(value: boolean) {
    const options = this.xpertAgent().options ?? {}
    this.apiService.updateXpertAgent(this.key(), {
      options: {...options, parallelToolCalls: value }
    })
  }

  updateOutputVariables(event: TAgentOutputVariable[]) {
    this.apiService.updateXpertAgent(this.key(), { outputVariables: event })
  }

  addOutputVar() {
    //
  }

  updateEnMessageHistory(enable: boolean) {
    const options = this.xpertAgent().options ?? {}
    this.apiService.updateXpertAgent(this.key(), {
      options: {...options, disableMessageHistory: !enable }
    })
  }

  addMessage() {
    const promptTemplates = this.promptTemplates()
    this.apiService.updateXpertAgent(this.key(), { promptTemplates: [
      ...(promptTemplates ?? []),
      {id: uuid(), role: 'human', text: ''}
    ]})
  }

  updatePromptTemplate(index: number, value: string) {
    const promptTemplates = this.promptTemplates()
    promptTemplates[index] = {
      ...promptTemplates[index],
      text: value
    }
    this.apiService.updateXpertAgent(this.key(), { promptTemplates: [...promptTemplates]})
  }

  removePrompt(index: number) {
    const promptTemplates = [...this.promptTemplates()]
    promptTemplates.splice(index, 1)
    this.apiService.updateXpertAgent(this.key(), { promptTemplates })
  }

  updateMemories(value: TVariableAssigner[]) {
    const options = this.xpertAgent().options ?? {}
    this.apiService.updateXpertAgent(this.key(), {
      options: {
        ...options,
        memories: value
      }
    })
  }

  synchronous() {
    if (!this.node().entity) {
      return
    }
    this.loading.set(true)
    this.agentService.getOneById(this.node().entity.id).subscribe({
      next: (agent) => {
        this.loading.set(false)
        this.apiService.updateXpertAgent(this.key(), agent)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  remove() {
    this.apiService.removeNode(this.key())
  }

  updateOptions(value: Partial<TXpertAgentOptions>) {
    const options = this.xpertAgent().options ?? {}
    this.apiService.updateXpertAgent(this.key(), {
      options: {...options, ...value }
    })
  }

  updateRetry(value: Partial<TXpertAgentOptions['retry']>) {
    const retry = this.retry() ?? {}
    this.updateOptions({retry: {...retry, ...value}})
  }

  updateFallback(value: Partial<TXpertAgentOptions['fallback']>) {
    const fallback = this.fallback() ?? {}
    this.updateOptions({fallback: {...fallback, ...value}})
  }

  updateErrorHandling(value: Partial<TXpertAgentOptions['errorHandling']>) {
    const errorHandling = this.errorHandling() ?? {}
    this.updateOptions({errorHandling: {...errorHandling, ...value}})
  }
}
