import { computed, inject, Injectable, signal } from '@angular/core'
import type { IChatConversation, IProjectCore, IProjectTask } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import { ChatConversationService } from '../../@core/services/chat-conversation.service'
import { getErrorMessage } from '../../@core/types'
import { injectHostedAssistantChatkitControl, sanitizeAssistantFrameUrl } from '../assistant/assistant-chatkit.runtime'
import { normalizeNonEmptyString } from './project-chatkit.utils'
import { ProjectAssistantFacade } from './project-assistant.facade'

type ProjectTaskConversationViewState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'missing-conversation'
  | 'missing-thread'
  | 'missing-assistant'
  | 'error'

@Injectable()
export class ProjectTaskAssistantFacade {
  readonly #chatConversationService = inject(ChatConversationService)
  readonly #projectAssistantFacade = inject(ProjectAssistantFacade)

  readonly #project = signal<IProjectCore | null>(null)
  readonly #taskConversation = signal<IProjectTask | null>(null)
  readonly #taskConversationDetail = signal<IChatConversation | null>(null)
  readonly #taskConversationLoading = signal(false)
  readonly #taskConversationError = signal<string | null>(null)
  readonly #taskConversationLoadVersion = signal(0)

  readonly taskConversation = this.#taskConversation.asReadonly()
  readonly taskConversationDetail = this.#taskConversationDetail.asReadonly()
  readonly error = computed(() => this.#taskConversationError())
  readonly title = computed(() => this.#taskConversation()?.title || this.#taskConversationDetail()?.title || '')
  readonly conversationId = computed(() =>
    normalizeNonEmptyString(this.#taskConversation()?.latestExecution?.conversationId)
  )
  readonly threadId = computed(() => normalizeNonEmptyString(this.#taskConversationDetail()?.threadId))
  readonly assistantId = computed(
    () =>
      normalizeNonEmptyString(this.#taskConversation()?.latestExecution?.xpertId) ||
      normalizeNonEmptyString(this.#taskConversationDetail()?.xpertId)
  )
  readonly viewState = computed<ProjectTaskConversationViewState>(() => {
    if (!this.#taskConversation()) {
      return 'idle'
    }

    if (!this.conversationId()) {
      return 'missing-conversation'
    }

    if (this.#taskConversationLoading()) {
      return 'loading'
    }

    if (this.#taskConversationError()) {
      return 'error'
    }

    if (!this.#taskConversationDetail()) {
      return 'missing-conversation'
    }

    if (!this.threadId()) {
      return 'missing-thread'
    }

    if (!this.assistantId()) {
      return 'missing-assistant'
    }

    return 'ready'
  })

  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => {
      const projectId = normalizeNonEmptyString(this.#project()?.id)
      const taskId = normalizeNonEmptyString(this.#taskConversation()?.id)
      const conversationId = this.conversationId()
      const threadId = this.threadId()
      const assistantId = this.assistantId()
      if (this.viewState() !== 'ready' || !projectId || !taskId || !conversationId || !threadId || !assistantId) {
        return null
      }

      return `${projectId}:${taskId}:${conversationId}:${threadId}:${assistantId}`
    }),
    assistantId: computed(() => (this.viewState() === 'ready' ? this.assistantId() : null)),
    frameUrl: computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL)),
    initialThread: computed(() => (this.viewState() === 'ready' ? this.threadId() : null)),
    projectId: computed(() => (this.viewState() === 'ready' ? normalizeNonEmptyString(this.#project()?.id) : null)),
    onEffect: (event) => this.#projectAssistantFacade.logChatkitEffect(event),
    onLog: (event) => this.#projectAssistantFacade.trackProjectMutationLog(event),
    titleKey: 'PAC.Project.TaskConversation',
    titleDefault: 'Task conversation'
  })

  setProject(project: IProjectCore | null) {
    this.#project.set(project)

    const taskConversation = this.#taskConversation()
    if (taskConversation && taskConversation.projectId !== project?.id) {
      this.setTaskConversation(null)
    }
  }

  setTaskConversation(task: IProjectTask | null) {
    const previousConversationKey = this.buildTaskConversationKey(this.#taskConversation())
    const nextConversationKey = this.buildTaskConversationKey(task)

    this.#taskConversation.set(task)

    if (previousConversationKey === nextConversationKey) {
      return
    }

    void this.syncConversation()
  }

  refresh() {
    void this.syncConversation()
  }

  private async syncConversation() {
    const task = this.#taskConversation()
    const conversationId = this.conversationId()
    const version = this.#taskConversationLoadVersion() + 1
    this.#taskConversationLoadVersion.set(version)

    if (!task || !conversationId) {
      this.#taskConversationDetail.set(null)
      this.#taskConversationError.set(null)
      this.#taskConversationLoading.set(false)
      return
    }

    this.#taskConversationLoading.set(true)
    this.#taskConversationError.set(null)

    try {
      const conversation = await firstValueFrom(
        this.#chatConversationService.getOneById(
          conversationId,
          undefined,
          normalizeNonEmptyString(task.latestExecution?.organizationId) ?? normalizeNonEmptyString(task.organizationId)
        )
      )
      if (version !== this.#taskConversationLoadVersion()) {
        return
      }

      this.#taskConversationDetail.set(conversation ?? null)
    } catch (error) {
      if (version !== this.#taskConversationLoadVersion()) {
        return
      }

      this.#taskConversationDetail.set(null)
      this.#taskConversationError.set(getErrorMessage(error))
    } finally {
      if (version === this.#taskConversationLoadVersion()) {
        this.#taskConversationLoading.set(false)
      }
    }
  }

  private buildTaskConversationKey(task: IProjectTask | null) {
    const taskId = normalizeNonEmptyString(task?.id)
    const conversationId = normalizeNonEmptyString(task?.latestExecution?.conversationId)
    const xpertId = normalizeNonEmptyString(task?.latestExecution?.xpertId)
    if (!taskId || !conversationId) {
      return null
    }

    return `${taskId}:${conversationId}:${xpertId ?? ''}`
  }
}
