import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import {
  ChatConversationService,
  ChatMessageFeedbackService,
  CopilotChatMessage,
  IChatConversation,
  IChatMessageFeedback,
  IXpertAgentExecution,
  TMessageComponentStep,
  TMessageContentComponent,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { combineLatest, of, switchMap } from 'rxjs'

@Injectable()
export class XpertExecutionService {
  readonly conversationService = inject(ChatConversationService)
  readonly feedbackService = inject(ChatMessageFeedbackService)

  readonly conversationId = signal<string>(null)

  readonly conversation = signal<IChatConversation>(null)
  readonly feedbacks = signal<Record<string, IChatMessageFeedback>>(null)

  readonly #messages = signal<Partial<CopilotChatMessage>[]>([])

  readonly messages = computed(() => {
    const messages = this.conversation()?.messages
    if (messages) {
      return [...messages.filter((_) => !this.#messages().some((m) => m.id === _.id)), ...this.#messages()]
    }
    return this.#messages()
  })

  readonly #agentExecutions = signal<Record<string, IXpertAgentExecution[]>>({})

  readonly executions = computed<Record<string, IXpertAgentExecution[]>>(() => {
      const agentExecutions = {}
      Object.values(this.#agentExecutions() ?? {}).forEach((executions) => {
        expandExecutions(executions, agentExecutions)
      })
      return agentExecutions
    })

  readonly agentExecutions = computed<Record<string, IXpertAgentExecution[]>>(() => {
    const agentExecutions = {}
    Object.values(this.#agentExecutions() ?? {}).forEach((executions) => {
      executions.forEach((execution) => {
        execution.subExecutions?.forEach((item) => {
          if (item.agentKey) {
            agentExecutions[item.agentKey] ??= []
            agentExecutions[item.agentKey] = agentExecutions[item.agentKey].filter((_) => _.id !== item.id).concat(item)
          }
        })
        if (execution.agentKey) {
          agentExecutions[execution.agentKey] ??= []
          agentExecutions[execution.agentKey] = agentExecutions[execution.agentKey].filter((_) => _.id !== execution.id).concat(execution)
        }
      })
    })
    return agentExecutions
  })

  readonly toolMessages = computed(() => {
    const executions: TMessageContentComponent<TMessageComponentStep>[] = []
    this.messages().forEach((message) => {
      if (message.role === 'ai' && Array.isArray(message.content)) {
        message.content?.forEach((content) => {
          if (content.type === 'component' && content.data?.tool) {
            executions.push(content as TMessageContentComponent<TMessageComponentStep>)
          }
        })
      }
    })

    return executions
  })

  readonly knowledgeMessages = computed(() => {
    const executions: TMessageContentComponent<TMessageComponentStep>[] = []
    this.messages().forEach((message) => {
      if (message.role === 'ai' && Array.isArray(message.content)) {
        message.content?.forEach((content) => {
          if (content.type === 'component' && content.data?.toolset === 'knowledgebase') {
            executions.push(content as TMessageContentComponent<TMessageComponentStep>)
          }
        })
      }
    })

    return executions
  })

  // Subsribe conversation
  private conversationSub = toObservable(this.conversationId)
    .pipe(
      switchMap((id) =>
        id
          ? combineLatest([
              this.conversationService.getById(id, { relations: ['messages'] }),
              this.feedbackService.getAll({ where: { conversationId: id } })
            ])
          : of([])
      )
    )
    .subscribe(([conv, feedbacks]) => {
      this.conversation.set(conv)
      this.feedbacks.set(
        feedbacks?.items.reduce((acc, feedback) => {
          acc[feedback.messageId] = feedback
          return acc
        }, {})
      )
    })

  constructor() {
    effect(
      () => {
        const executions = this.conversation()?.executions
        if (executions) {
          this.#agentExecutions.set(
            executions.reduce(
              (acc, execution) => {
                acc[execution.agentKey] ??= []
                acc[execution.agentKey].push(execution)
                return acc
              },
              {} as Record<string, IXpertAgentExecution[]>
            )
          )
        }
      },
      { allowSignalWrites: true }
    )
  }

  setMessages(messages: Partial<CopilotChatMessage>[]) {
    this.#messages.set(messages)
  }

  setAgentExecution(key: string, execution: IXpertAgentExecution) {
    this.#agentExecutions.update((state) => {
      const executions = state[key] ?? []
      return {
        ...state,
        [key]: executions.filter((_) => _.id !== execution.id).concat(execution)
      }
    })
  }

  setConversation(value: IChatConversation) {
    this.clear()
    this.conversation.set(null)
    this.conversationId.set(value?.id)
    this.#messages.set([])
  }

  markError(error: string) {
    this.#agentExecutions.update((state) => {
      return Object.keys(state).reduce((acc, key) => {
        acc[key] = state[key].map((execution) => {
          return execution.status === XpertAgentExecutionStatusEnum.RUNNING
            ? {
                ...execution,
                status: XpertAgentExecutionStatusEnum.ERROR,
                error
              }
            : execution
        })
        return acc
      }, {})
    })
  }

  clear() {
    this.#agentExecutions.set({})
  }
}

function expandExecutions(executions: IXpertAgentExecution[], expanded: Record<string, IXpertAgentExecution[]>) {
  executions?.forEach((execution) => {
    if (execution.agentKey) {
      expanded[execution.agentKey] ??= []
      expanded[execution.agentKey] = expanded[execution.agentKey].filter((_) => _.id !== execution.id).concat(execution)
    }
    expandExecutions(execution.subExecutions, expanded)
  })
}