import { CommonModule } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotChatMessage, getErrorMessage, IIndicator, injectToastr, ISemanticModel, IXpert, registerModel, ToolCall, XpertAgentExecutionStatusEnum } from '../../@core'
import { ToolCallConfirmComponent, XpertParametersCardComponent } from '../../@shared/xpert'
import { AppService } from '../../app.service'
import { ChatAiMessageComponent } from '../ai-message/ai-message.component'
import { ChatService } from '../chat.service'
import { EmojiAvatarComponent } from '../../@shared/avatar'
import { ChatInputComponent } from '../chat-input/chat-input.component'
import { XpertHomeService } from '../home.service'
import { NgmDSCoreService, provideOcapCore } from '@metad/ocap-angular/core'
import { convertNewSemanticModelResult, Indicator, NgmSemanticModel } from '@metad/cloud/state'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, of, tap } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    NgmCommonModule,
    EmojiAvatarComponent,
    ToolCallConfirmComponent,
    ChatAiMessageComponent,
    XpertParametersCardComponent
  ],
  selector: 'chat-conversation',
  templateUrl: './conversation.component.html',
  styleUrl: 'conversation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideOcapCore(),
  ]
})
export class ChatConversationComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly chatService = inject(ChatService)
  readonly homeService = inject(XpertHomeService)
  readonly appService = inject(AppService)
  readonly #wasmAgent? = inject(WasmAgentService, {optional: true})
  readonly #dsCoreService = inject(NgmDSCoreService)
  readonly #toastr = injectToastr()
  // readonly #router = inject(Router)

  // Inputs
  readonly xpert = input.required<IXpert>()
  // readonly chatInput = input.required<ChatInputComponent>()
  readonly showExecution = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // States
  readonly messages = this.chatService.messages
  readonly conversation = this.chatService.conversation
  readonly loadingConv = this.chatService.loadingConv

  readonly lastMessage = computed(() => this.messages()[this.messages().length - 1] as CopilotChatMessage)
  readonly lastExecutionId = computed(() => this.lastMessage()?.executionId)
  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly error = computed(() => this.conversation()?.error)
  readonly operation = computed(() => this.chatService.conversation()?.operation)
  readonly toolCalls = signal<ToolCall[]>(null)
  readonly #confirmOperation = computed(() => this.toolCalls() ? {...this.operation(), toolCalls: this.toolCalls().map((call) => ({call}))} : null)
  readonly parameters = computed(() => this.xpert()?.agent?.parameters)

  readonly parametersValue = this.chatService.parametersValue

    // SemanticModels
    readonly #semanticModels = signal<
    Record<
      string,
      {
        model?: ISemanticModel
        indicators?: Indicator[]
        dirty?: boolean
      }
    >
  >({})

  // Fetch semantic models details
  readonly _semanticModels = derivedAsync(() => {
    const ids = Object.keys(this.#semanticModels()).filter((id) => !this.#semanticModels()[id].model)
    if (ids.length) {
      return combineLatest(ids.map((id) => this.homeService.selectSemanticModel(id))).pipe(
        tap({
          error: (err) => {
            this.#toastr.error(getErrorMessage(err))
          }
        })
      )
    } else {
      return of(null)
    }
  })
  
  constructor() {
    effect(() => {
      if (this.conversation()) {
        this.homeService.conversation.set({...this.conversation(), messages: this.messages()})
      }
    }, { allowSignalWrites: true })

    // Got model details
    effect(
      () => {
        const models = this._semanticModels()
        if (models) {
          this.#semanticModels.update((state) => {
            models.forEach((model) => {
              state[model.id] = {
                ...state[model.id],
                model,
                dirty: true
              }
            })

            return {
              ...state
            }
          })
        }
      },
      { allowSignalWrites: true }
    )

    // Register the model when all conditions are ready
    effect(
      () => {
        const models = Object.values(this.#semanticModels()).filter((model) => model.dirty && model.model)
        if (models.length) {
          models.forEach(({ model, indicators }) => {
            const _model = convertNewSemanticModelResult({
              ...model,
              key: model.id
            })

            this.registerModel(_model, indicators)
          })

          this.#semanticModels.update((state) => {
            return Object.keys(state).reduce((acc, key) => {
              acc[key] = { ...state[key], dirty: state[key].model ? false : state[key].dirty }
              return acc
            }, {})
          })
        }
      },
      { allowSignalWrites: true }
    )
  }

  onToolCalls(toolCalls: ToolCall[]) {
    this.toolCalls.set(toolCalls)
  }

  onConfirm() {
    this.chatService.chat({ confirm: true, operation: this.#confirmOperation() })
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
  }
  
  onReject() {
    this.chatService.chat({ reject: true, operation: this.operation() })
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
  }

  onRetry() {
    this.chatService.updateConversation({
      status: 'busy',
      error: null
    })
    this.chatService.chat({
      retry: true
    })
  }

  private registerModel(model: NgmSemanticModel, indicators: IIndicator[]) {
    registerModel(model, this.#dsCoreService, this.#wasmAgent, indicators)
  }

  /**
   * Collect the semantic models and the corresponding runtime indicators to be registered.
   *
   * @param models Model id and runtime indicators
   */
  registerSemanticModel(models: { id: string; indicators?: Indicator[] }[]) {
    this.#semanticModels.update((state) => {
      models.forEach(({ id, indicators }) => {
        state[id] ??= {}
        if (indicators) {
          state[id].indicators ??= []
          state[id].indicators = [
            ...state[id].indicators.filter((_) => !indicators.some((i) => i.code === _.code)),
            ...indicators
          ]
        }
      })
      return { ...state }
    })
  }
}
