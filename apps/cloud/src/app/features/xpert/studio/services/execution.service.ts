import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import {
  ChatConversationService,
  CopilotChatMessage,
  IChatConversation,
  IXpertAgentExecution,
} from 'apps/cloud/src/app/@core'
import { of, switchMap } from 'rxjs'

@Injectable()
export class XpertExecutionService {
  readonly conversationService = inject(ChatConversationService)

  readonly conversationId = signal<string>(null)

  readonly conversation = signal<IChatConversation>(null)

  readonly #messages = signal<CopilotChatMessage[]>([])

  readonly messages = computed(() => {
    if (this.conversation()?.messages) {
        return [...this.conversation().messages, ...this.#messages()]
    }
    return this.#messages()
  })

  // readonly execution = signal<IXpertAgentExecution>(null)
  readonly #agentExecutions = signal<Record<string, IXpertAgentExecution>>({})
  readonly agentExecutions = computed(() => {
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

  readonly toolExecutions = signal<Record<string, Partial<IXpertAgentExecution>>>({})
  readonly knowledgeExecutions = signal<Record<string, Partial<IXpertAgentExecution>>>({})

  // Subsribe conversation
  private conversationSub = toObservable(this.conversationId).pipe(
    switchMap((id) => id ? this.conversationService.getById(this.conversationId(), { relations: [] }) : of(null))
  ).subscribe((conv) => {
    this.conversation.set(conv)
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

  appendMessage(message: CopilotChatMessage) {
    this.#messages.update(
      (state) =>[...(state ?? []), message]
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

  setToolExecution(name: string, execution: Partial<IXpertAgentExecution>) {
    this.toolExecutions.update((state) => ({
      ...state,
      [name]: execution
    }))
  }

  setKnowledgeExecution(name: string, execution: Partial<IXpertAgentExecution>) {
    this.knowledgeExecutions.update((state) => ({
      ...state,
      [name]: execution
    }))
  }

  clear() {
    this.#agentExecutions.set({})
    this.toolExecutions.set({})
    this.knowledgeExecutions.set({})
  }
}
