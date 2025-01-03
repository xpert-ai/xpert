import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import {
  ChatConversationService,
  ChatMessageFeedbackService,
  CopilotChatMessage,
  IChatConversation,
  IChatMessageFeedback,
  IXpertAgentExecution,
  XpertAgentExecutionStatusEnum,
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

  // readonly execution = signal<IXpertAgentExecution>(null)
  readonly #agentExecutions = signal<Record<string, IXpertAgentExecution>>({})
  readonly agentExecutions = computed<Record<string, IXpertAgentExecution>>(() => {
    const agentExecutions = {}
    Object.values(this.#agentExecutions() ?? {}).forEach((execution) => {
      execution.subExecutions?.forEach((item) => {
        if (item.agentKey) {
          agentExecutions[item.agentKey] = item
        }
      })
      if (execution.agentKey) {
        agentExecutions[execution.agentKey] = execution
      }
    })

    Object.keys(this.knowledgeExecutions() ?? {}).forEach((id) => {
      agentExecutions[id] = this.knowledgeExecutions()[id]
    })

    return agentExecutions
  })

  readonly toolExecutions = signal<Record<string, Record<string, Partial<IXpertAgentExecution>>>>({})
  readonly knowledgeExecutions = signal<Record<string, Partial<IXpertAgentExecution>>>({})

  // Subsribe conversation
  private conversationSub = toObservable(this.conversationId).pipe(
    switchMap((id) => id ? combineLatest([
      this.conversationService.getById(this.conversationId(), { relations: ['messages'] }),
      this.feedbackService.getAll({ where: { conversationId: this.conversationId(), } })
    ]) : of([]))
  ).subscribe(([conv, feedbacks]) => {
    this.conversation.set(conv)
    this.feedbacks.set(feedbacks?.items.reduce((acc, feedback) => {
      acc[feedback.messageId] = feedback
      return acc
    }, {}))
  })

  constructor() {
    effect(() => {
      const executions = this.conversation()?.executions
      if (executions) {
        this.#agentExecutions.set(executions.reduce((acc, execution) => {
          acc[execution.agentKey] = execution
          return acc
        }, {} as Record<string, IXpertAgentExecution>))
      }
    }, { allowSignalWrites: true })
  }

  appendMessage(message: Partial<CopilotChatMessage>) {
    this.#messages.update(
      (state) => {
        const messages = state?.filter((_) => _.id !== message.id)
        return [...(messages ?? []), message]
      }
    )
  }

  setAgentExecution(key: string, execution: IXpertAgentExecution) {
    this.#agentExecutions.update((state) => ({
      ...state,
      [key]: execution
    }))
  }

  setConversation(value: IChatConversation) {
    this.clear()
    this.conversation.set(null)
    this.conversationId.set(value?.id)
    this.#messages.set([])
  }

  /**
   * Update execution of tool call
   * 
   * @param name Tool's name
   * @param id Execution run id
   * @param execution Execution entity
   */
  updateToolExecution(name: string, id: string, execution: Partial<IXpertAgentExecution>) {
    this.toolExecutions.update((state) => ({
      ...state,
      [name]: {
        ...(state[name] ?? {}),
        [id]: {
          ...(state[name]?.[id] ?? {}),
          ...execution
        }
      }
    }))
  }

  setKnowledgeExecution(name: string, execution: Partial<IXpertAgentExecution>) {
    this.knowledgeExecutions.update((state) => ({
      ...state,
      [name]: execution
    }))
  }

  markError(error: string) {
    this.#agentExecutions.update((state) => {
      return Object.keys(state).reduce((acc, key) => {
        acc[key] = state[key].status === XpertAgentExecutionStatusEnum.RUNNING ? {
          ...state[key],
          status: XpertAgentExecutionStatusEnum.ERROR,
          error
        } : state[key]
        return acc
      }, {})
    })

    this.toolExecutions.update((state) => {
      return Object.keys(state).reduce((acc, name) => {
        acc[name] = Object.keys(acc[name] ?? {}).reduce((executions, id) => {
          executions[id] = acc[name][id].status  === XpertAgentExecutionStatusEnum.RUNNING ? {
            ...acc[name][id],
            status: XpertAgentExecutionStatusEnum.ERROR,
            error
          } : acc[name][id]
          return executions
        }, {})
        return acc
      }, {})
    })

    this.knowledgeExecutions.update((state) => {
      return Object.keys(state).reduce((acc, key) => {
        acc[key] = state[key].status === XpertAgentExecutionStatusEnum.RUNNING ? {
          ...state[key],
          status: XpertAgentExecutionStatusEnum.ERROR,
          error
        } : state[key]
        return acc
      }, {})
    })
  }

  clear() {
    this.#agentExecutions.set({})
    this.toolExecutions.set({})
    this.knowledgeExecutions.set({})
  }
}
