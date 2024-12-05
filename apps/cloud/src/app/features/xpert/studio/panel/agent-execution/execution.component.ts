import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  getErrorMessage,
  IXpert,
  IXpertAgent,
  IXpertAgentExecution,
  ToastrService,
  XpertAgentExecutionEnum,
  XpertAgentExecutionService,
  XpertAgentService
} from 'apps/cloud/src/app/@core'
import {
  CopilotStoredMessageComponent,
  MaterialModule,
  XpertParametersCardComponent
} from 'apps/cloud/src/app/@shared'
import { MarkdownModule } from 'ngx-markdown'
import { of, Subscription } from 'rxjs'
import { distinctUntilChanged, switchMap } from 'rxjs/operators'
import { XpertAgentExecutionComponent } from '../../../../../@shared/'
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
    FFlowModule,
    MaterialModule,
    FormsModule,
    TranslateModule,
    MarkdownModule,
    CopilotStoredMessageComponent,
    XpertAgentExecutionComponent,
    XpertParametersCardComponent
  ],
  host: {
    tabindex: '-1',
    '[class.selected]': 'isSelected'
  }
})
export class XpertStudioPanelAgentExecutionComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionEnum

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

  readonly execution = computed(() => this.executionService.agentExecutions()?.[this.agentKey()])
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
  }

  clearStatus() {
    this.output.set('')
    this.executionService.clear()
    this.executionService.setConversation(null)
  }

  startRunAgent() {
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
        agent: this.xpertAgent(),
        xpert: this.xpert(),
        executionId: this.executionId()
      })
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.#toastr.error(msg.data)
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
          this.#toastr.error(getErrorMessage(error))
          this.loading.set(false)
        },
        complete: () => {
          this.loading.set(false)
        }
      })
  }

  stopAgent() {
    this.#agentSubscription?.unsubscribe()
    this.loading.set(false)
  }

  getAgent(key: string): IXpertAgent {
    return this.apiService.getNode(key)?.entity as IXpertAgent
  }

}

export function processEvents(event, executionService: XpertExecutionService) {
  switch(event.event) {
    case ChatMessageEventTypeEnum.ON_CONVERSATION_START: {
      executionService.conversation.update((state) => ({
        ...(state ?? {}),
        ...event.data
      }))
      break;
    }
    case ChatMessageEventTypeEnum.ON_TOOL_START: {
      executionService.setToolExecution(event.data.name, {status: XpertAgentExecutionEnum.RUNNING})
      break;
    }
    case ChatMessageEventTypeEnum.ON_TOOL_END: {
      executionService.setToolExecution(event.data.name, {status: XpertAgentExecutionEnum.SUCCEEDED})
      break;
    }
    case ChatMessageEventTypeEnum.ON_TOOL_ERROR: {
      executionService.setToolExecution(event.data.name, {status: XpertAgentExecutionEnum.FAILED, error: event.data.error })
      break;
    }
    case ChatMessageEventTypeEnum.ON_AGENT_START:
    case ChatMessageEventTypeEnum.ON_AGENT_END: {
      executionService.setAgentExecution(event.data.agentKey, event.data)
      break;
    }
    case ChatMessageEventTypeEnum.ON_RETRIEVER_START: {
      executionService.setKnowledgeExecution(event.data.name, {status: XpertAgentExecutionEnum.RUNNING})
      break;
    }
    case ChatMessageEventTypeEnum.ON_RETRIEVER_END: {
      executionService.setKnowledgeExecution(event.data.name, {status: XpertAgentExecutionEnum.SUCCEEDED})
      break;
    }
    case ChatMessageEventTypeEnum.ON_RETRIEVER_ERROR: {
      executionService.setKnowledgeExecution(event.data.name, {status: XpertAgentExecutionEnum.FAILED, error: event.data.error})
      break;
    }
    default: {
      console.log(`未处理的事件：`, event)
    }
  }
}