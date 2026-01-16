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
import {
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  getErrorMessage,
  IXpert,
  IXpertAgent,
  IXpertAgentExecution,
  messageContentText,
  TXpertParameter,
  XpertParameterTypeEnum,
  TInterruptCommand,
  ToastrService,
  TToolCall,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertAgentService
} from '@cloud/app/@core'
import { XpertAgentOperationComponent } from '@cloud/app/@shared/agent'
import { CopilotStoredMessageComponent } from '@cloud/app/@shared/copilot'
import { XpertAgentExecutionStatusComponent, XpertParametersCardComponent } from '@cloud/app/@shared/xpert'
import { TranslateModule } from '@ngx-translate/core'
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
    XpertAgentOperationComponent
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

  // Inputs
  readonly executionId = input<string>()
  readonly xpert = input<Partial<IXpert>>()
  readonly xpertAgent = input<IXpertAgent>()

  // Outputs
  readonly close = output()

  // States
  readonly agentKey = computed(() => this.xpertAgent()?.key)
  readonly parameters = computed(() => this.xpertAgent().parameters)

  readonly parameterValue = model<Record<string, unknown>>()
  readonly input = model<string>(null)

  readonly output = signal('')

  readonly execution = computed(() => {
    const executions = this.executionService.agentExecutions()?.[this.agentKey()]
    return executions ? executions[executions.length - 1] : null
  })
  readonly #expandAgents = signal<Record<string, boolean>>({})
  readonly executions = computed(() => {
    const agentExecutions = this.executionService.agentExecutions()
    if (!agentExecutions) {
      return []
    }
    const executions: { executions: IXpertAgentExecution[]; agent: IXpertAgent; expand: boolean }[] = []
    Object.keys(agentExecutions).forEach((key) => {
      executions.push({
        executions: agentExecutions[key],
        agent: this.getAgent(key),
        expand: this.#expandAgents()[key]
      })
    })
    return executions
  })

  readonly status = computed(() => this.execution()?.status)
  readonly operation = computed(() => this.execution()?.operation)
  readonly command = model<TInterruptCommand>()
  readonly #toolCalls = signal<TToolCall[]>(null)
  readonly environment = this.apiService.environment

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

    effect(
      () => {
        if (this.execution()) {
          this.parameterValue.set(this.execution().inputs)
        }
      },
      { allowSignalWrites: true }
    )
  }

  clearStatus() {
    this.output.set('')
    this.executionService.clear()
    this.executionService.setConversation(null)
  }

  onKeyEnter(param: Event) {
    const event = param as KeyboardEvent
    if (event.code === 'Enter' && !event.isComposing) {
      if (this.input()?.trim()) {
        this.startRunAgent()
      }
    }
  }

  startRunAgent(options?: {
    /**
     * @deprecated use onConfirm with command resume instead
     */
    reject: boolean;
    confirm?: boolean
  }) {
    // English note: Validate user inputs against parameter definitions before sending to server.
    // This provides instant feedback and prevents avoidable backend errors.
    if (!this.validateParameterValues(this.parameters(), this.parameterValue() ?? {})) {
      return
    }

    const executionId = this.execution()?.id
    this.loading.set(true)
    // Clear
    this.clearStatus()

    // Call chat server
    this.#agentSubscription = this.xpertAgentService
      .chatAgent({
        input: {
          ...(this.parameterValue() ?? {}),
          input: this.input().trim()
        },
        agentKey: this.xpertAgent().key,
        xpertId: this.xpert().id,
        executionId,
        environmentId: this.environment()?.id,
        command: this.command(),
        // operation: (options?.reject || this.#toolCalls()) ? {
        //   ...this.operation(),
        //   toolCalls: this.#toolCalls()?.map((call) => ({call}))
        // } : null,
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
                this.output.update((state) => state + messageContentText(event.data))
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

  /**
   * Validate parameter values for max length / maximum constraints.
   *
   * Returns false when invalid and shows a user-facing error message.
   */
  private validateParameterValues(parameters: TXpertParameter[] | null | undefined, values: Record<string, unknown>): boolean {
    if (!parameters?.length) {
      return true
    }

    for (const parameter of parameters) {
      const raw = (values as any)?.[parameter.name]
      if (raw == null) {
        continue
      }

      const maximum = typeof parameter.maximum === 'number' ? parameter.maximum : null
      if (!maximum || !Number.isFinite(maximum)) {
        continue
      }

      if (
        parameter.type === XpertParameterTypeEnum.STRING ||
        parameter.type === XpertParameterTypeEnum.TEXT ||
        parameter.type === XpertParameterTypeEnum.PARAGRAPH ||
        parameter.type === XpertParameterTypeEnum.SECRET
      ) {
        if (typeof raw === 'string' && raw.length > maximum) {
          this.#toastr.error(`参数 "${parameter.name}" 超出最大长度限制：${maximum}`)
          return false
        }
      } else if (parameter.type === XpertParameterTypeEnum.NUMBER) {
        // English note: For NUMBER type, "maximum" means max digit length (not numeric value).
        const str = typeof raw === 'number' ? String(raw) : String(raw ?? '')
        const digitLength = (str.match(/\d/g) ?? []).length
        if (digitLength > maximum) {
          this.#toastr.error(`参数 "${parameter.name}" 超出最大长度限制：${maximum}`)
          return false
        }
      }
    }

    return true
  }

  onChatError(message: string) {
    this.#toastr.error(message)
    this.loading.set(false)
    this.executionService.markError(message)
  }

  stopAgent() {
    this.#agentSubscription?.unsubscribe()
    this.loading.set(false)
    this.executionService.conversation.update((state) => ({
        ...state,
        status: XpertAgentExecutionStatusEnum.ERROR,
        error: 'Aborted by user'
      }))
  }

  getAgent(key: string): IXpertAgent {
    return this.apiService.getNode(key)?.entity as IXpertAgent
  }

  onToolCalls(toolCalls: TToolCall[]) {
    this.#toolCalls.set(toolCalls)
  }

  onConfirm() {
    this.input.set(null)
    this.startRunAgent()
  }

  /**
   * @deprecated use onConfirm with command resume instead
   */
  onReject() {
    this.input.set(null)
    this.startRunAgent({ reject: true })
  }

  toggleExpand(key: string) {
    this.#expandAgents.update((state) => ({
      ...state,
      [key]: !state[key]
    }))
  }
}

export function processEvents(
  event: { type: ChatMessageTypeEnum; event?: ChatMessageEventTypeEnum; data: any },
  executionService: XpertExecutionService
) {
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
    // case ChatMessageEventTypeEnum.ON_TOOL_START: {
    //   executionService.updateToolExecution(event.data.name, event.data.metadata?.langgraph_checkpoint_ns, {
    //     status: XpertAgentExecutionStatusEnum.RUNNING,
    //     createdAt: new Date(),
    //     agentKey: event.data.agentKey
    //   })
    //   break
    // }
    // case ChatMessageEventTypeEnum.ON_TOOL_END: {
    //   executionService.updateToolExecution(event.data.name, event.data.metadata?.langgraph_checkpoint_ns, {
    //     status: XpertAgentExecutionStatusEnum.SUCCESS,
    //     inputs: {
    //       ...(event.data.data?.input ?? {})
    //     },
    //     outputs: {
    //       output: event.data.data?.output?.content
    //     },
    //     agentKey: event.data.agentKey
    //   })
    //   break
    // }
    // case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
    //   executionService.updateToolExecution(event.data.name, event.data.metadata?.langgraph_checkpoint_ns, {
    //     status: XpertAgentExecutionStatusEnum.ERROR,
    //     error: event.data.error,
    //     agentKey: event.data.agentKey
    //   })
    //   break
    // }
    case ChatMessageEventTypeEnum.ON_AGENT_START:
    case ChatMessageEventTypeEnum.ON_AGENT_END: {
      executionService.setAgentExecution(event.data.agentKey, event.data)
      break
    }
    // case ChatMessageEventTypeEnum.ON_RETRIEVER_START: {
    //   executionService.setKnowledgeExecution(event.data.name, { status: XpertAgentExecutionStatusEnum.RUNNING })
    //   break
    // }
    // case ChatMessageEventTypeEnum.ON_RETRIEVER_END: {
    //   executionService.setKnowledgeExecution(event.data.name, { status: XpertAgentExecutionStatusEnum.SUCCESS })
    //   break
    // }
    // case ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR: {
    //   executionService.setKnowledgeExecution(event.data.name, {
    //     status: XpertAgentExecutionStatusEnum.ERROR,
    //     error: event.data.error
    //   })
    //   break
    // }
    case ChatMessageEventTypeEnum.ON_MESSAGE_START: {
      break
    }
    case ChatMessageEventTypeEnum.ON_INTERRUPT: {
      break
    }
    case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
      break
    }
    default: {
      console.log(`Unprocessed chat events:`, event)
    }
  }
}
