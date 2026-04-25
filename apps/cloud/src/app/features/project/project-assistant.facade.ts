import { computed, inject, Injectable, signal } from '@angular/core'
import type { ChatKitEventHandlers } from '@xpert-ai/chatkit-angular'
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

type ProjectAssistantRefreshHandler = (() => void | Promise<void>) | null
type ProjectAssistantEffectEvent = Parameters<NonNullable<ChatKitEventHandlers['onEffect']>>[0]
type ProjectAssistantLogEvent = Parameters<NonNullable<ChatKitEventHandlers['onLog']>>[0]

const PROJECT_ASSISTANT_LOG_PREFIX = '[ProjectChatKit]'
const PROJECT_MUTATION_LOG_NAME = 'lg.tool.end'
const PROJECT_MUTATION_TOOL_NAMES = new Set([
  'createProjectTasks',
  'updateProjectTasks',
  'reorderProjectTasks',
  'moveProjectTasks',
  'createProjectSprint',
  'updateProjectSprint',
  'bindProjectTeams',
  'updateProjectTeamBindings',
  'removeProjectTeamBinding',
  'updateProjectSwimlanes'
])

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
  #pendingProjectDataRefresh = false
  #projectDataRefreshScheduled = false
  #projectDataRefreshInFlight = false
  #projectDataRefreshHandler: ProjectAssistantRefreshHandler = null

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
    onEffect: (event) => this.logChatkitEffect(event),
    onLog: (event) => this.trackProjectMutationLog(event),
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

    this.#pendingProjectDataRefresh = false
    this.#projectDataRefreshScheduled = false
    void this.syncLatestConversation()
  }

  setPageLoading(loading: boolean) {
    this.#pageLoading.set(loading)
  }

  setProjectDataRefreshRequested(handler: ProjectAssistantRefreshHandler) {
    this.#projectDataRefreshHandler = handler
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

  private trackProjectMutationLog(event: ProjectAssistantLogEvent) {
    const toolName = typeof event.data?.toolName === 'string' ? event.data.toolName.trim() : ''
    const matchesRefreshLog = event.name === PROJECT_MUTATION_LOG_NAME && PROJECT_MUTATION_TOOL_NAMES.has(toolName)

    this.debugLog('Received ChatKit log event', {
      eventName: event.name,
      eventData: event.data ?? null,
      toolName: toolName || null,
      matchesRefreshLog,
      pendingProjectDataRefresh: this.#pendingProjectDataRefresh
    })

    if (event.name !== PROJECT_MUTATION_LOG_NAME) {
      return
    }

    if (!PROJECT_MUTATION_TOOL_NAMES.has(toolName)) {
      this.debugLog('Ignored ChatKit tool log for project refresh', {
        toolName: toolName || null,
        allowedToolNames: Array.from(PROJECT_MUTATION_TOOL_NAMES)
      })
      return
    }

    this.#pendingProjectDataRefresh = true
    this.debugLog('Queued project page refresh from ChatKit log event', {
      toolName,
      pendingProjectDataRefresh: this.#pendingProjectDataRefresh
    })
    this.scheduleProjectDataRefresh()
  }

  private scheduleProjectDataRefresh() {
    if (this.#projectDataRefreshScheduled) {
      this.debugLog('Skipped scheduling duplicate project page refresh microtask', {
        pendingProjectDataRefresh: this.#pendingProjectDataRefresh,
        projectDataRefreshInFlight: this.#projectDataRefreshInFlight
      })
      return
    }

    this.#projectDataRefreshScheduled = true
    this.debugLog('Scheduled project page refresh processing from ChatKit log event', {
      pendingProjectDataRefresh: this.#pendingProjectDataRefresh,
      projectDataRefreshInFlight: this.#projectDataRefreshInFlight
    })

    queueMicrotask(() => {
      this.#projectDataRefreshScheduled = false
      void this.flushProjectDataRefresh()
    })
  }

  private async flushProjectDataRefresh() {
    this.debugLog('Processing project page refresh queue', {
      pendingProjectDataRefresh: this.#pendingProjectDataRefresh,
      hasRefreshHandler: Boolean(this.#projectDataRefreshHandler),
      projectDataRefreshInFlight: this.#projectDataRefreshInFlight
    })

    if (!this.#pendingProjectDataRefresh) {
      return
    }

    if (this.#projectDataRefreshInFlight) {
      this.debugLog('Skipped starting a new project page refresh because one is already in flight', {
        pendingProjectDataRefresh: this.#pendingProjectDataRefresh
      })
      return
    }

    this.#pendingProjectDataRefresh = false
    this.#projectDataRefreshInFlight = true
    this.debugLog('Triggering project page refresh from ChatKit log event', {
      hasRefreshHandler: Boolean(this.#projectDataRefreshHandler)
    })

    try {
      await this.runProjectDataRefreshHandler()
    } finally {
      this.#projectDataRefreshInFlight = false

      this.debugLog('Finished project page refresh triggered from ChatKit log event', {
        pendingProjectDataRefresh: this.#pendingProjectDataRefresh
      })

      if (this.#pendingProjectDataRefresh) {
        this.scheduleProjectDataRefresh()
      }
    }
  }

  private logChatkitEffect(event: ProjectAssistantEffectEvent) {
    this.debugLog('Received ChatKit effect event', {
      effectName: event.name,
      effectData: event.data ?? null
    })
  }

  private async runProjectDataRefreshHandler() {
    const refreshHandler = this.#projectDataRefreshHandler
    if (!refreshHandler) {
      this.debugLog('Skipped project page refresh because no refresh handler is registered')
      return
    }

    this.debugLog('Invoking registered project page refresh handler')

    try {
      await refreshHandler()
      this.debugLog('Registered project page refresh handler completed successfully')
    } catch (error) {
      this.debugLog('Registered project page refresh handler failed', {
        error
      })
    }
  }

  private debugLog(message: string, details?: Record<string, unknown>) {
    console.debug(PROJECT_ASSISTANT_LOG_PREFIX, message, {
      projectId: this.#project()?.id ?? null,
      assistantId: this.#project()?.mainAssistantId ?? null,
      ...details
    })
  }
}
