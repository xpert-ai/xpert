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
  XpertAPIService,
  agentUniqueName,
  injectToastr,
  getErrorMessage,
  DateRelativePipe,
  TAgentOutputVariable,
  uuid,
  TVariableAssigner,
  XpertAgentService,
  TXpertAgentOptions,
  injectHelpWebsite,
  XpertParameterTypeEnum,
  TSelectOption,
  TXpertTeamNode,
  CopilotServerService,
  ModelFeature
} from 'apps/cloud/src/app/@core'
import { AppService } from 'apps/cloud/src/app/app.service'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioPanelAgentExecutionComponent } from '../agent-execution/execution.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertStudioPanelToolsetSectionComponent } from './toolset-section/toolset.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, catchError, distinctUntilChanged, filter, map, of, retry, shareReplay, startWith, switchMap } from 'rxjs'
import { CdkMenuModule } from '@angular/cdk/menu'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioPanelKnowledgeSectionComponent } from './knowledge-section/knowledge.component'
import { CopilotModelSelectComponent, CopilotPromptEditorComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertOutputVariablesEditComponent, XpertParametersEditComponent, XpertVariablesAssignerComponent } from 'apps/cloud/src/app/@shared/xpert'
import { MatTooltipModule } from '@angular/material/tooltip'
import { isEqual, uniq } from 'lodash-es'
import { XpertStudioComponent } from '../../studio.component'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { myRxResource, NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, nonNullable, OverlayAnimations } from '@metad/core'
import { MatSliderModule } from '@angular/material/slider'
import { XpertWorkflowErrorHandlingComponent } from 'apps/cloud/src/app/@shared/workflow'
import { VISION_DEFAULT_VARIABLE } from '../../types'
import { StateVariableSelectComponent, TXpertVariablesOptions } from '@cloud/app/@shared/agent'
import { toSignal } from '@angular/core/rxjs-interop'

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

    NgmI18nPipe,
    NgmDensityDirective,
    NgmSpinComponent,
    EmojiAvatarComponent,
    StateVariableSelectComponent,
    XpertStudioPanelToolsetSectionComponent,
    CopilotModelSelectComponent,
    XpertStudioPanelAgentExecutionComponent,
    XpertParametersEditComponent,
    CopilotPromptEditorComponent,
    XpertStudioPanelKnowledgeSectionComponent,
    XpertOutputVariablesEditComponent,
    XpertVariablesAssignerComponent,
    XpertWorkflowErrorHandlingComponent
  ],
  host: {
    tabindex: '-1',
  },
  animations: [IfAnimation, ...OverlayAnimations]
})
export class XpertStudioPanelAgentComponent {
  eModelType = AiModelTypeEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly regex = `{{(.*?)}}`
  readonly elementRef = inject(ElementRef)
  readonly appService = inject(AppService)
  readonly apiService = inject(XpertStudioApiService)
  readonly xpertAPI = inject(XpertAPIService)
  readonly agentService = inject(XpertAgentService)
  readonly executionService = inject(XpertAgentExecutionService)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly copilotServer = inject(CopilotServerService)
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
  // readonly toolsets = computed(() => this.xpertAgent()?.toolsets)
  readonly name = computed(() => this.xpertAgent()?.name)
  readonly title = computed(() => this.xpertAgent()?.title)
  readonly prompt = model<string>()
  readonly promptLength = computed(() => this.prompt()?.length)
  readonly agentUniqueName = computed(() => agentUniqueName(this.xpertAgent()))
  // readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly agentConfig = linkedModel({
    initialValue: null,
    compute: () => this.xpert()?.agentConfig,
    update: (config) => {
      this.apiService.updateXpertAgentConfig(config)
    }
  })
  readonly isSensitive = computed(() => this.agentConfig()?.interruptBefore?.includes(this.agentUniqueName()))
  readonly isEnd = computed(() => this.agentConfig()?.endNodes?.includes(this.agentUniqueName()))
  readonly mute = computed(() => this.agentConfig()?.mute)

  readonly disableOutput = linkedModel({
    initialValue: false,
    compute: () => this.mute()?.some((_) => _.length === 1 && _[0] === this.key()),
    update: (value) => {
      const key = this.key()
      const mute = this.mute() ?? []
      const index = mute.findIndex((_) => _.length === 1 && _[0] === key)

      if (value) {
        if (index === -1) {
          this.agentConfig.update((config) => ({
            ...config,
            mute: [...(config?.mute ?? []), [key]]
          }))
        }
      } else {
        if (index >= 0) {
          this.agentConfig.update((config) => {
            const mute = [...config.mute]
            mute.splice(index, 1)
            return {
              ...config,
              mute
            }
          })
        }
      }
    }
  })
  
  readonly agentOptions = linkedModel({
    initialValue: null,
    compute: () => this.xpertAgent()?.options,
    update: (options) => {
      this.apiService.updateXpertAgent(this.key(), {options})
    }
  })
  readonly enableMessageHistory = computed(() => !this.agentOptions()?.disableMessageHistory)
  readonly historyVariable = attrModel(this.agentOptions, 'historyVariable')
  readonly promptTemplates = computed(() => this.xpertAgent()?.promptTemplates)
  readonly isPrimaryAgent = computed(() => !!this.xpertAgent()?.xpertId)

  readonly parameters = computed(() => this.xpertAgent()?.parameters)
  readonly memories = computed(() => this.agentOptions()?.memories)
  readonly parallelToolCalls = computed(() => this.agentOptions()?.parallelToolCalls ?? true)
  readonly vision = attrModel(this.agentOptions, 'vision')
  readonly visionEnabled = attrModel(this.vision, 'enabled')
  readonly resolution = attrModel(this.vision, 'resolution')
  readonly visionVariable = linkedModel({
    initialValue: null,
    compute: () => this.vision()?.variable ?? VISION_DEFAULT_VARIABLE,
    update: (variable) => {
      this.vision.update((state) => ({...(state ?? {}), variable}))
    }
  })
  readonly visionCanEnable = computed(() => this.selectedAiModel()?.features?.includes(ModelFeature.VISION))
  readonly draft = this.apiService.viewModel
  readonly toolsets = computed(() => {
    const draft = this.draft()
    return draft.connections?.filter((conn) => conn.from === this.key())
      .map((conn) => draft.nodes.find((n) => n.type === 'toolset' && n.key === conn.to) as TXpertTeamNode & {type: 'toolset'})
      .filter(nonNullable)
  })

  // Error handling
  readonly retry = computed(() => this.xpertAgent()?.options?.retry)
  readonly retryEnabled = computed(() => this.retry()?.enabled)
  readonly stopAfterAttempt = computed(() => this.retry()?.stopAfterAttempt)
  readonly fallback = computed(() => this.xpertAgent()?.options?.fallback)
  readonly fallbackEnabled = computed(() => this.fallback()?.enabled)
  readonly fallbackModel = computed(() => this.fallback()?.copilotModel)
  readonly errorHandling = computed(() => this.xpertAgent()?.options?.errorHandling)
  readonly errorHandlingType = computed(() => this.errorHandling()?.type)

  // LinkedModels
  readonly structuredOutputMethod = attrModel(this.agentOptions, 'structuredOutputMethod')
  readonly structuredOutputMethodOption = computed(() => {
    return this.StructuredOutputMethodOptions.find((_) => this.structuredOutputMethod() ? _.value === this.structuredOutputMethod() : !_.value)
  })


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

  readonly copilotWithModels = derivedAsync(() => {
    const modelType = this.copilotModelType()
    const copilotId = this.copilotId()
    return this.copilotServer.getCopilotModels(modelType).pipe(
      map((copilots) => {
        return copilots?.filter((_) => copilotId ? _.id === copilotId : true )
          .sort((a, b) => {
            const roleOrder = { primary: 0, secondary: 1, embedding: 2 }
            return roleOrder[a.role] - roleOrder[b.role]
          })
      })
    )
  })
  readonly copilotModel = model<ICopilotModel>()
  readonly copilotModelType = computed(() => this.copilotModel()?.modelType)
  readonly copilotId = computed(() => this.copilotModel()?.copilotId)
  readonly model = computed(() => this.copilotModel()?.model)
  readonly selectedCopilotWithModels = computed(() => {
    return this.copilotWithModels()?.find((_) => _.id === this.copilotId())
  })
  readonly selectedAiModel = computed(() =>
    this.selectedCopilotWithModels()?.providerWithModels?.models?.find((_) => _.model === this.model() &&
      (this.copilotModelType() ? _.model_type === this.copilotModelType() : true))
  )

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

  readonly connections = toSignal(
    this.apiService.savedEvent$.pipe(
      filter((value) => value),
      map(() => {
        return this.apiService
          .viewModel()
          .connections.filter((c) => c.from.startsWith(this.key()) || c.to.startsWith(this.key()))
          .map((c) => c.key)
      }),
      distinctUntilChanged(isEqual)
    )
  )
  // Fetch avaiable variables for this agent from server
  readonly varOptions = computed<TXpertVariablesOptions>(() => ({
    xpertId: this.xpertId(),
    agentKey: this.key(),
    environmentId: this.apiService.environmentId(),
    connections: this.connections(),
  }))

  readonly #variables = myRxResource({
    request: () => ({
      xpertId: this.xpertId(),
      agentKey: this.key(),
      environmentId: this.apiService.environmentId(),
      connections: this.connections(),
    } as TXpertVariablesOptions),
      loader: ({ request }) => {
        return request ? this.xpertAPI.getNodeVariables(request) : of(null)
      }
    })
  readonly variables = this.#variables.value

  readonly promptTemplateFullscreen = signal<string>(null)

  readonly loading = signal(false)

  // Diagram of agents
  readonly refreshDiagram$ = new BehaviorSubject<void>(null)
  readonly diagram$ = this.refreshDiagram$.pipe(
    switchMap(() => this.xpertAPI.getDiagram(this.xpert().id, this.key()).pipe(
      map((imageBlob) => imageBlob ? {image: URL.createObjectURL(imageBlob), error: null} : null),
      catchError((err) => of({image: null, error: getErrorMessage(err)})),
      startWith(null))
    ),
    shareReplay(1)
  )

  readonly defaultValueSchema = [
    {
      type: XpertParameterTypeEnum.STRING,
      name: 'content',
      title: 'Text'
    }
  ]

  readonly StructuredOutputMethodOptions: TSelectOption<TXpertAgentOptions['structuredOutputMethod']>[] = [
    {
      value: null,
      label: {
        zh_Hans: '默认',
        en_US: 'Default'
      },
      description: {
        zh_Hans: '消息内容',
        en_US: 'Message content'
      }
    },
    {
      value: 'functionCalling',
      label: {
        zh_Hans: '函数调用',
        en_US: 'Function Calling'
      },
      description: {
        zh_Hans: '将工具调用参数从对象解析回原始模式',
        en_US: 'Tool call arguments to be parsed from an object back to the original schema'
      }
    },
    {
      value: 'jsonMode',
      label: {
        zh_Hans: 'JSON 模式',
        en_US: 'JSON Mode'
      },
      description: {
        zh_Hans: '将输出解析为 JSON 对象',
        en_US: 'Parse output as a JSON object'
      }
    }
  ]

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
      if (this.selectedAiModel() && !this.visionCanEnable()) {
        this.visionEnabled.set(false)
      }
    }, { allowSignalWrites: true })
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

  moveToNode() {
    this.xpertStudioComponent.centerGroupOrNode(this.key())
  }
}
