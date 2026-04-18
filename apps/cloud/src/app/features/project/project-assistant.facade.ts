import { computed, inject, Injectable, signal } from '@angular/core'
import { AssistantBindingScope, AssistantCode, type IChatConversation, type IProjectCore, type IXpert } from '@xpert-ai/contracts'
import { ChatConversationService } from '../../@core/services/chat-conversation.service'
import { AssistantBindingService } from '../../@core/services/assistant-binding.service'
import { getErrorMessage } from '../../@core/types'
import { injectHostedAssistantChatkitControl, sanitizeAssistantFrameUrl } from '../assistant/assistant-chatkit.runtime'
import { environment } from '@cloud/environments/environment'
import { firstValueFrom } from 'rxjs'

type ProjectAssistantViewState =
  | 'loading'
  | 'no-project'
  | 'binding-required'
  | 'assistant-unavailable'
  | 'error'
  | 'ready'

@Injectable()
export class ProjectAssistantFacade {
  readonly #chatConversationService = inject(ChatConversationService)
  readonly #assistantBindingService = inject(AssistantBindingService)

  readonly #project = signal<IProjectCore | null>(null)
  readonly #pageLoading = signal(false)
  readonly #availableAssistants = signal<IXpert[]>([])
  readonly #assistantsLoading = signal(true)
  readonly #assistantsError = signal<string | null>(null)
  readonly #latestConversation = signal<IChatConversation | null>(null)
  readonly #conversationLoading = signal(false)
  readonly #conversationError = signal<string | null>(null)
  readonly #assistantLoadVersion = signal(0)
  readonly #conversationLoadVersion = signal(0)

  readonly project = this.#project.asReadonly()
  readonly availableAssistants = this.#availableAssistants.asReadonly()
  readonly latestConversation = this.#latestConversation.asReadonly()
  readonly assistant = computed(
    () =>
      this.#availableAssistants().find((assistant) => assistant.id === this.#project()?.mainAssistantId) ?? null
  )
  readonly assistantLabel = computed(() => {
    const assistant = this.assistant()
    if (assistant) {
      return assistant.title || assistant.name || assistant.slug || assistant.id
    }

    return this.#project()?.mainAssistantId || ''
  })
  readonly assistantSecondaryLabel = computed(() => this.assistant()?.slug || this.assistant()?.id || '')
  readonly error = computed(() => this.#conversationError() || this.#assistantsError())
  readonly viewState = computed<ProjectAssistantViewState>(() => {
    if (this.#pageLoading()) {
      return 'loading'
    }

    const project = this.#project()
    if (!project) {
      return 'no-project'
    }

    if (!project.mainAssistantId) {
      return 'binding-required'
    }

    if (this.#assistantsLoading() || this.#conversationLoading()) {
      return 'loading'
    }

    if (this.error()) {
      return 'error'
    }

    if (!this.assistant()) {
      return 'assistant-unavailable'
    }

    return 'ready'
  })

  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => {
      const project = this.#project()
      if (this.viewState() !== 'ready' || !project?.id || !project.mainAssistantId) {
        return null
      }

      return `${project.id}:${project.mainAssistantId}`
    }),
    assistantId: computed(() => (this.viewState() === 'ready' ? this.#project()?.mainAssistantId ?? null : null)),
    frameUrl: computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL)),
    initialThread: computed(() => (this.viewState() === 'ready' ? this.#latestConversation()?.threadId ?? null : null)),
    projectId: computed(() => (this.viewState() === 'ready' ? this.#project()?.id ?? null : null)),
    titleKey: 'PAC.Project.MainAgentTitle',
    titleDefault: 'Project Main Agent'
  })

  constructor() {
    void this.loadAvailableAssistants()
  }

  setProject(project: IProjectCore | null) {
    const previousConversationKey = this.buildConversationKey(this.#project())
    const nextConversationKey = this.buildConversationKey(project)

    this.#project.set(project)

    if (previousConversationKey === nextConversationKey) {
      return
    }

    void this.syncLatestConversation()
  }

  setPageLoading(loading: boolean) {
    this.#pageLoading.set(loading)
  }

  async refresh() {
    await this.loadAvailableAssistants()
    await this.syncLatestConversation()
  }

  private async loadAvailableAssistants() {
    const version = this.#assistantLoadVersion() + 1
    this.#assistantLoadVersion.set(version)
    this.#assistantsLoading.set(true)
    this.#assistantsError.set(null)

    try {
      const assistants: IXpert[] = await firstValueFrom(
        this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.PROJECT_MAIN)
      )
      if (version !== this.#assistantLoadVersion()) {
        return
      }

      this.#availableAssistants.set(assistants ?? [])
    } catch (error) {
      if (version !== this.#assistantLoadVersion()) {
        return
      }

      this.#availableAssistants.set([])
      this.#assistantsError.set(getErrorMessage(error))
    } finally {
      if (version === this.#assistantLoadVersion()) {
        this.#assistantsLoading.set(false)
      }
    }
  }

  private async syncLatestConversation() {
    const project = this.#project()
    if (!project?.id || !project.mainAssistantId) {
      this.#latestConversation.set(null)
      this.#conversationError.set(null)
      this.#conversationLoading.set(false)
      return
    }

    const version = this.#conversationLoadVersion() + 1
    this.#conversationLoadVersion.set(version)
    this.#conversationLoading.set(true)
    this.#conversationError.set(null)

    try {
      const conversation: IChatConversation | null = await firstValueFrom(
        this.#chatConversationService.findLatestByProject(project.id, project.mainAssistantId)
      )
      if (version !== this.#conversationLoadVersion()) {
        return
      }

      this.#latestConversation.set(conversation ?? null)
    } catch (error) {
      if (version !== this.#conversationLoadVersion()) {
        return
      }

      this.#latestConversation.set(null)
      this.#conversationError.set(getErrorMessage(error))
    } finally {
      if (version === this.#conversationLoadVersion()) {
        this.#conversationLoading.set(false)
      }
    }
  }

  private buildConversationKey(project: IProjectCore | null) {
    if (!project?.id || !project.mainAssistantId) {
      return null
    }

    return `${project.id}:${project.mainAssistantId}`
  }
}
