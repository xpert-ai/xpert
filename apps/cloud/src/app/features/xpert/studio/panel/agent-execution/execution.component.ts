import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  getErrorMessage,
  IXpert,
  IXpertAgent,
  IXpertAgentExecution,
  ToastrService,
  ToolCall,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertAgentService
} from 'apps/cloud/src/app/@core'
import { CopilotStoredMessageComponent } from 'apps/cloud/src/app/@shared/copilot'
import {
  ToolCallConfirmComponent,
  XpertAgentExecutionStatusComponent,
  XpertParametersCardComponent
} from 'apps/cloud/src/app/@shared/xpert'
import { MarkdownModule } from 'ngx-markdown'
import { of, Subscription } from 'rxjs'
import { distinctUntilChanged, switchMap } from 'rxjs/operators'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'

@Component({
  selector: 'xpert-studio-panel-agent-execution',
  templateUrl: './execution.component.html',
  styleUrls: ['./execution.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MarkdownModule,
    CopilotStoredMessageComponent,
    XpertAgentExecutionStatusComponent,
    XpertParametersCardComponent,
    ToolCallConfirmComponent
  ],
  host: {
    tabindex: '-1',
    '[class.selected]': 'isSelected'
  }
})
export class XpertStudioPanelAgentExecutionComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly xpertAgentService = inject(XpertAgentService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly studioComponent = inject(XpertStudioComponent)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)

  readonly executionId = input<string>()
  readonly xpert = input<Partial<IXpert>>()
  readonly xpertAgent = input<IXpertAgent>()

  readonly close = output()

  readonly agentKey = computed(() => this.xpertAgent()?.key)
  readonly parameters = computed(() => this.xpertAgent().parameters)

  readonly parameterValue = model<Record<string, unknown>>()
  readonly input = model<string>(null)

  readonly output = signal('')

  readonly execution = computed(() => {
    const executions = this.executionService.agentExecutions()?.[this.agentKey()]
    return executions ? executions[executions.length - 1] : null
  })
  readonly executions = computed(() => {
    const agentExecutions = this.executionService.agentExecutions()
    if (!agentExecutions) {
      return []
    }
    const executions: IXpertAgentExecution[] = []
    Object.keys(agentExecutions).forEach((key) => {
      executions.push({
        ...agentExecutions[key],
        agent: this.getAgent(key)
      })
    })
    return executions
  })

  readonly status = computed(() => this.execution()?.status)
  readonly operation = computed(() => this.execution()?.operation)
  readonly #toolCalls = signal<ToolCall[]>(null)

  readonly loading = signal(false)
  #agentSubscription: Subscription = null

  private executionSub = toObservable(this.executionId)
    .pipe(
      distinctUntilChanged(),
      switchMap((id) => (id ? this.agentExecutionService.getOneLog(id) : of(null)))
    )
    .subscribe((value) => {
      this.executionService.clear()
      if (value) {
        this.executionService.setAgentExecution(value.agentKey, value)
      }
      this.input.set(value?.inputs?.input)
      this.output.set(value?.outputs?.output)
    })

  constructor() {
    // register a destroy callback
    this.#destroyRef.onDestroy(() => {
      this.clearStatus()
    })

    effect(() => {
      if (this.execution()) {
        this.parameterValue.set(this.execution().inputs)
      }
    }, { allowSignalWrites: true })
  }

  clearStatus() {
    this.output.set('')
    this.executionService.clear()
    this.executionService.setConversation(null)
  }

  onKeyEnter(param: Event) {
    const event = param as KeyboardEvent
    if (event.code === 'Enter' && !event.isComposing) {
      this.startRunAgent()
    }
  }

  startRunAgent(options?: { reject: boolean; confirm?: boolean }) {
    const executionId = this.execution()?.id
    this.loading.set(true)
    // Clear
    this.clearStatus()

    // Call chat server
    this.#agentSubscription = this.xpertAgentService
      .chatAgent({
        input: {
          ...(this.parameterValue() ?? {}),
          input: this.input()
        },
        // agent: this.xpertAgent(),
        agentKey: this.xpertAgent().key,
        xpertId: this.xpert().id,
        executionId,
        toolCalls: this.#toolCalls(),
        reject: options?.reject
      })
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.onChatError(msg.data)
          } else {
            if (msg.data) {
              const event = JSON.parse(msg.data)
              if (event.type === ChatMessageTypeEnum.MESSAGE) {
                if (typeof event.data === 'string') {
                  this.output.update((state) => state + event.data)
                } else {
                  console.log(`未处理的消息：`, event)
                }
              } else if (event.type === ChatMessageTypeEnum.EVENT) {
                processEvents(event, this.executionService)
              }
            }
          }
        },
        error: (error) => {
          this.onChatError(getErrorMessage(error))
        },
        complete: () => {
          this.loading.set(false)
        }
      })
  }

  onChatError(message: string) {
    this.#toastr.error(message)
    this.loading.set(false)
    this.executionService.markError(message)
  }

  stopAgent() {
    this.#agentSubscription?.unsubscribe()
    this.loading.set(false)
  }

  getAgent(key: string): IXpertAgent {
    return this.apiService.getNode(key)?.entity as IXpertAgent
  }

  onToolCalls(toolCalls: ToolCall[]) {
    this.#toolCalls.set(toolCalls)
  }

  onConfirm() {
    this.input.set(null)
    this.startRunAgent()
  }

  onReject() {
    this.input.set(null)
    this.startRunAgent({ reject: true })
  }
}

export function processEvents(
  event: {type: ChatMessageTypeEnum; event?: ChatMessageEventTypeEnum; data: any},
  executionService: XpertExecutionService) {
  switch (event.event) {
    case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
      executionService.conversation.update((state) => ({
        ...(state ?? {}),
        ...event.data
      }))
      break
    }
    case ChatMessageEventTypeEnum.ON_CONVERSATION_END: {
      executionService.conversation.update((state) => ({
        ...(state ?? {}),
        ...event.data
      }))
      break
    }
    case ChatMessageEventTypeEnum.ON_TOOL_START: {
      executionService.updateToolExecution(event.data.name, event.data.metadata?.langgraph_checkpoint_ns, {
        status: XpertAgentExecutionStatusEnum.RUNNING,
        createdAt: new Date()
      })
      break
    }
    case ChatMessageEventTypeEnum.ON_TOOL_END: {
      executionService.updateToolExecution(event.data.name, event.data.metadata?.langgraph_checkpoint_ns, {
        status: XpertAgentExecutionStatusEnum.SUCCESS,
        inputs: {
          ...(event.data.data?.input ?? {})
        },
        outputs: {
          output: event.data.data?.output?.content
        }
      })
      break
    }
    case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
      executionService.updateToolExecution(event.data.name, event.data.metadata?.langgraph_checkpoint_ns, {
        status: XpertAgentExecutionStatusEnum.ERROR,
        error: event.data.error
      })
      break
    }
    case ChatMessageEventTypeEnum.ON_AGENT_START:
    case ChatMessageEventTypeEnum.ON_AGENT_END: {
      executionService.setAgentExecution(event.data.agentKey, event.data)
      break
    }
    case ChatMessageEventTypeEnum.ON_RETRIEVER_START: {
      executionService.setKnowledgeExecution(event.data.name, { status: XpertAgentExecutionStatusEnum.RUNNING })
      break
    }
    case ChatMessageEventTypeEnum.ON_RETRIEVER_END: {
      executionService.setKnowledgeExecution(event.data.name, { status: XpertAgentExecutionStatusEnum.SUCCESS })
      break
    }
    case ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR: {
      executionService.setKnowledgeExecution(event.data.name, {
        status: XpertAgentExecutionStatusEnum.ERROR,
        error: event.data.error
      })
      break
    }
    case ChatMessageEventTypeEnum.ON_MESSAGE_START: {
      break
    }
    case ChatMessageEventTypeEnum.ON_INTERRUPT: {
      break
    }
    default: {
      console.log(`未处理的事件：`, event)
    }
  }
}
