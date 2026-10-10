import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { environment } from '@cloud/environments/environment'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { firstValueFrom } from 'rxjs'
import { filter, map, startWith } from 'rxjs/operators'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  IXpert,
  Store
} from '../../../@core'
import type {
  ProjectSelection,
  TXpertProjectAccessSummary,
  WorkbenchExtensionViewOpenRequest
} from '@xpert-ai/contracts'
import { sanitizeAssistantFrameUrl } from '../../assistant/assistant-chatkit.runtime'
import { XpertProjectApiService } from '../../project/project-api.service'
import { WorkbenchChatFacade, WorkbenchChatViewState } from '../workbench-chat/workbench-chat.facade'
import type { ConversationEntryResolution } from './conversation-entry.resolver'

@Injectable()
export class XpertWorkbenchFacade implements WorkbenchChatFacade {
  #loadRequestId = 0
  #projectAccessRequestId = 0
  #projectNavigationRequestId = 0
  #lastConversationEntryKey: string | null = null
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #projectApi = inject(XpertProjectApiService)
  readonly #route = inject(ActivatedRoute)
  readonly #entryResolution = toSignal(
    this.#route.data.pipe(map((data) => data['conversationEntry'] as ConversationEntryResolution | undefined)),
    { initialValue: this.#route.snapshot.data['conversationEntry'] as ConversationEntryResolution | undefined }
  )

  readonly definition = {
    titleKey: 'XP.Chat.XpertWorkbench.Title',
    defaultTitle: 'Xpert'
  }

  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly userId = signal(this.#store.userId ?? null)
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => normalizeWorkbenchPath(this.#router.url))
    ),
    { initialValue: normalizeWorkbenchPath(this.#router.url) }
  )
  readonly slug = computed(() => parseWorkbenchSlug(this.currentUrl()))
  readonly #groupEntry = computed(() => {
    const entry = this.#entryResolution()?.entry
    return entry?.purpose === 'group' ? entry : null
  })
  readonly groupId = computed(() => this.#groupEntry()?.id ?? null)
  readonly group = computed(() => {
    const id = this.groupId()
    return id ? { id } : null
  })
  readonly projectId = computed(() => parseWorkbenchProjectId(this.currentUrl()))
  readonly #routeProjectMode = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const mode = this.#router.parseUrl(this.#router.url).queryParams['projectMode']
        return mode === 'none' || mode === 'auto-new' ? mode : null
      })
    )
  )
  readonly #adoptedProject = signal<{
    assistantId: string
    threadId: string
    projectId: string | null
    mountProjectId: string | null
    selection: ProjectSelection
  } | null>(null)
  readonly chatkitMountProjectId = computed(() => {
    const adopted = this.#adoptedProject()
    return adopted && adopted.assistantId === this.assistantId() && adopted.threadId === this.threadId()
      ? adopted.mountProjectId
      : this.projectId()
  })
  readonly chatkitProjectSelection = computed<ProjectSelection>(() => {
    const adopted = this.#adoptedProject()
    if (adopted?.assistantId === this.assistantId() && adopted.threadId === this.threadId()) return adopted.selection
    const projectId = this.chatkitMountProjectId()
    if (projectId) return { mode: 'existing', projectId }
    const mode = this.#routeProjectMode()
    if (mode) return { mode }
    return { mode: this.currentXpert()?.options?.workspaceScope?.onMissing ? 'auto-new' : 'none' }
  })
  readonly projectAccess = signal<TXpertProjectAccessSummary | null>(null)
  readonly projectName = signal<string | null>(null)
  readonly threadId = computed(() =>
    this.groupId() || this.#entryResolution()?.error ? null : parseWorkbenchThreadId(this.currentUrl())
  )
  readonly availableXperts = signal<IXpert[]>([])
  readonly loading = signal(false)
  readonly loadingUserPreference = signal(false)
  readonly errorMessage = signal<string | null>(null)
  readonly suppressAutoResume = signal(false)
  readonly pendingConversationStartId = signal(0)
  readonly activeConversation = signal<IChatConversation | null>(null)
  readonly chatkitFrameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))
  readonly currentXpert = computed(() => {
    const slug = this.slug()
    if (!slug) {
      return null
    }

    return this.availableXperts().find((item) => item.slug === slug || item.id === slug) ?? null
  })
  readonly xpertId = computed(() =>
    this.groupId() ? (this.#groupEntry()?.xpertId ?? null) : (this.currentXpert()?.id ?? null)
  )
  readonly assistantId = computed(() => this.xpertId())
  readonly assistantTitle = computed(() =>
    this.groupId()
      ? (this.#groupEntry()?.title ?? null)
      : this.currentXpert()?.title || this.currentXpert()?.name || null
  )
  readonly assistantAvatar = computed(() => this.currentXpert()?.avatar ?? null)
  readonly initialLayout = computed(() => this.currentXpert()?.options?.workbench?.initialLayout ?? null)
  readonly defaultViewKey = computed(() => this.currentXpert()?.options?.workbench?.defaultViewKey?.trim() || null)
  readonly identity = computed(() => {
    if (this.groupId()) return `chat-group:${this.groupId()}`
    const xpertId = this.xpertId()
    return xpertId ? `chat-xpert-workbench:${xpertId}` : null
  })
  readonly viewState = computed<WorkbenchChatViewState>(() => {
    if (!this.organizationId()) {
      return 'organization-required'
    }
    if (!this.chatkitFrameUrl()) {
      return 'error'
    }
    if (this.errorMessage() || this.#entryResolution()?.error) {
      return 'error'
    }
    if (this.groupId()) {
      return this.#entryResolution()?.organizationId === this.organizationId() ? 'ready' : 'error'
    }
    if (!this.currentXpert()) {
      return 'wizard'
    }

    return 'ready'
  })

  constructor() {
    effect(() => {
      const adopted = this.#adoptedProject()
      if (adopted && (adopted.assistantId !== this.assistantId() || adopted.threadId !== this.threadId())) {
        this.#adoptedProject.set(null)
      }
    })
    effect(() => {
      const organizationId = this.organizationId()
      const slug = this.slug()
      const groupId = this.groupId()

      if (!organizationId) {
        this.#loadRequestId++
        this.availableXperts.set([])
        this.errorMessage.set(null)
        this.loading.set(false)
        this.activeConversation.set(null)
        this.suppressAutoResume.set(false)
        return
      }

      void this.loadState(slug, groupId)
    })

    effect(() => {
      if (!this.isConversationEntryRoute()) {
        this.#lastConversationEntryKey = null
      }
    })

    effect(() => {
      const organizationId = this.organizationId()
      const projectId = this.projectId()
      const requestId = ++this.#projectAccessRequestId
      this.projectAccess.set(null)
      this.projectName.set(null)

      if (!organizationId || !projectId) {
        return
      }

      void this.loadProjectAccess(projectId, requestId)
      void this.loadProjectName(projectId, requestId)
    })
  }

  viewErrorMessage() {
    if (!this.chatkitFrameUrl()) {
      return this.#translate.instant('XP.Chat.ClawXpert.FrameMissing', {
        Default: 'CHATKIT_FRAME_URL is not configured for ChatKit.'
      })
    }

    return (
      this.errorMessage() ||
      this.#entryResolution()?.error ||
      this.#translate.instant('XP.Chat.XpertWorkbench.LoadFailedDesc', {
        Default: 'This xpert is unavailable or you do not have access.'
      })
    )
  }

  onChatThreadChange(threadId: string | null) {
    if (this.groupId()) return
    this.handleThreadChange(threadId)
  }

  /** Adopt only the server's saved scope, keeping the current stream and composer mounted. */
  async syncConversationProject(threadId: string): Promise<void> {
    if (this.groupId()) return
    const assistantId = this.assistantId()
    if (!assistantId || this.threadId() !== threadId) return
    const projectId = this.projectId()
    try {
      const conversation = await firstValueFrom(this.#conversationService.getByThreadId(threadId))
      if (
        !conversation ||
        this.assistantId() !== assistantId ||
        this.threadId() !== threadId ||
        this.projectId() !== projectId
      )
        return
      const savedProjectId = conversation.projectId ?? null
      if (savedProjectId === projectId) {
        if (projectId) await this.loadProjectName(projectId, this.#projectAccessRequestId)
        return
      }
      const slug = this.currentXpert()?.slug ?? this.slug()
      if (!slug) return
      this.#adoptedProject.set({
        assistantId,
        threadId,
        projectId: savedProjectId,
        mountProjectId: this.chatkitMountProjectId(),
        selection: this.chatkitProjectSelection()
      })
      const opened = await this.#router.navigate(
        savedProjectId ? ['/chat/x', slug, 'p', savedProjectId, 'c', threadId] : ['/chat/x', slug, 'c', threadId],
        projectId
          ? {
              queryParamsHandling: 'merge',
              queryParams: { projectMode: null, viewSelection: null, viewParameters: null },
              replaceUrl: true
            }
          : { queryParamsHandling: 'preserve', replaceUrl: true }
      )
      if (!opened && this.threadId() === threadId) this.#adoptedProject.set(null)
    } catch {
      // Route refresh is best effort; the persisted conversation remains the
      // runtime authority, and the response-end event retries the refresh.
    }
  }

  async onChatProjectChange(
    projectId: string | null,
    view?: WorkbenchExtensionViewOpenRequest,
    selection?: ProjectSelection
  ): Promise<boolean> {
    if (this.groupId()) return false
    const normalizedProjectId = projectId?.trim() || null
    if (normalizedProjectId === this.projectId() && !view && !selection) return true
    const slug = this.currentXpert()?.slug ?? this.slug()
    if (!slug) return false
    const navigationRequestId = ++this.#projectNavigationRequestId
    const previous = {
      url: this.#router.url,
      conversation: this.activeConversation(),
      access: this.projectAccess(),
      adoptedProject: this.#adoptedProject(),
      suppressAutoResume: this.suppressAutoResume()
    }
    this.suppressAutoResume.set(true)
    this.#adoptedProject.set(null)
    this.activeConversation.set(null)
    if (normalizedProjectId !== this.projectId()) {
      this.#projectAccessRequestId++
      this.projectAccess.set(null)
    }
    const commands = normalizedProjectId ? ['/chat/x', slug, 'p', normalizedProjectId, 'c'] : ['/chat/x', slug, 'c']
    const restore = () => {
      if (navigationRequestId !== this.#projectNavigationRequestId || this.#router.url !== previous.url) return
      this.activeConversation.set(previous.conversation)
      this.projectAccess.set(previous.access)
      this.#adoptedProject.set(previous.adoptedProject)
      this.suppressAutoResume.set(previous.suppressAutoResume)
      const projectId = this.projectId()
      if (!previous.access && projectId) void this.loadProjectAccess(projectId, ++this.#projectAccessRequestId)
    }
    try {
      const opened = await this.#router.navigate(
        commands,
        !view
          ? {
              queryParamsHandling: 'merge',
              queryParams: {
                projectMode: selection?.mode === 'existing' ? null : (selection?.mode ?? null),
                viewProject: null,
                viewSelection: null,
                viewParameters: null
              }
            }
          : {
              queryParamsHandling: 'merge',
              queryParams: {
                view: view.viewKey,
                projectMode: null,
                viewProject: null,
                viewSelection: view.selectionId ?? null,
                viewParameters: view.parameters ? JSON.stringify(view.parameters) : null
              }
            }
      )
      if (!opened) restore()
      return opened
    } catch (error) {
      restore()
      throw error
    }
  }

  async beginPendingConversation(startId: number, control: ChatKitControl) {
    if (!startId || this.pendingConversationStartId() !== startId) {
      return
    }

    try {
      await control.setThreadId(null)
      await control.focusComposer()
    } finally {
      if (this.pendingConversationStartId() === startId) {
        this.pendingConversationStartId.set(0)
      }
    }
  }

  async ensureConversationEntry(control: ChatKitControl) {
    if (!this.isConversationEntryRoute()) {
      this.#lastConversationEntryKey = null
      return
    }

    const xpertId = this.xpertId()
    if (!control || !xpertId || this.threadId() || this.viewState() !== 'ready') {
      return
    }

    const entryKey = `${xpertId}:${JSON.stringify(this.chatkitProjectSelection())}`
    if (this.#lastConversationEntryKey === entryKey) {
      return
    }

    this.#lastConversationEntryKey = entryKey
    await control.setThreadId(null)
    await control.focusComposer()
  }

  setActiveConversation(conversation: IChatConversation | null) {
    this.activeConversation.set(conversation ? ({ ...conversation } as IChatConversation) : null)
  }

  patchActiveConversationStatus(status: 'busy' | 'idle') {
    this.activeConversation.update((conversation) =>
      conversation ? ({ ...conversation, status } as IChatConversation) : conversation
    )
  }

  private async loadState(slug: string | null, groupId: string | null) {
    const requestId = ++this.#loadRequestId
    this.loading.set(true)
    this.errorMessage.set(null)

    if (groupId) {
      this.availableXperts.set([])
      this.activeConversation.set(null)
      this.loading.set(false)
      return
    }

    if (!slug) {
      this.availableXperts.set([])
      this.errorMessage.set(
        this.#translate.instant('XP.Chat.XpertWorkbench.MissingSlug', { Default: 'Xpert route is missing.' })
      )
      this.loading.set(false)
      return
    }

    try {
      const xperts = await firstValueFrom(
        this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
      )
      const normalizedXperts = normalizeXperts(xperts)
      const matchedXpert = normalizedXperts.find((item) => item.slug === slug || item.id === slug)

      if (requestId !== this.#loadRequestId) {
        return
      }

      this.availableXperts.set(normalizedXperts)
      if (!matchedXpert) {
        this.errorMessage.set(
          this.#translate.instant('XP.Chat.XpertWorkbench.NotFound', {
            Default: 'This xpert is unavailable or you do not have access.'
          })
        )
      }
    } catch (error) {
      if (requestId !== this.#loadRequestId) {
        return
      }

      this.availableXperts.set([])
      this.errorMessage.set(
        getErrorMessage(error) ||
          this.#translate.instant('XP.Chat.XpertWorkbench.LoadFailedDesc', {
            Default: 'This xpert is unavailable or you do not have access.'
          })
      )
    } finally {
      if (requestId === this.#loadRequestId) {
        this.loading.set(false)
      }
    }
  }

  private async loadProjectAccess(projectId: string, requestId: number) {
    try {
      const access = await firstValueFrom(this.#projectApi.access(projectId))
      if (requestId === this.#projectAccessRequestId && this.projectId() === projectId) {
        this.projectAccess.set(access)
      }
    } catch {
      if (requestId === this.#projectAccessRequestId && this.projectId() === projectId) {
        this.projectAccess.set(null)
      }
    }
  }

  private async loadProjectName(projectId: string, requestId: number) {
    try {
      const project = await firstValueFrom(this.#projectApi.get(projectId))
      if (requestId === this.#projectAccessRequestId && this.projectId() === projectId)
        this.projectName.set(project.name)
    } catch {
      // Keep the generic Project label when metadata is temporarily unavailable.
    }
  }

  private handleThreadChange(threadId: string | null) {
    if (threadId === this.threadId()) {
      return
    }

    if (threadId) {
      this.suppressAutoResume.set(false)
      this.navigateToThread(threadId)
      return
    }

    if (this.threadId()) {
      this.suppressAutoResume.set(true)
    }

    void this.navigateToChat()
  }

  private async navigateToChat() {
    const slug = this.currentXpert()?.slug ?? this.slug()
    if (!slug) {
      return
    }

    const commands = this.workbenchRouteCommands(slug)
    if (this.currentUrl() === this.workbenchRoutePath(slug)) {
      return
    }

    await this.#router.navigate(commands, { queryParamsHandling: 'preserve' })
  }

  private navigateToThread(threadId: string) {
    const slug = this.currentXpert()?.slug ?? this.slug()
    if (!slug) {
      return
    }

    const commands = [...this.workbenchRouteCommands(slug), threadId]
    if (
      this.threadId() === threadId &&
      this.currentUrl() === `${this.workbenchRoutePath(slug)}/${encodeURIComponent(threadId)}`
    ) {
      return
    }

    void this.#router.navigate(commands, { queryParamsHandling: 'preserve' })
  }

  private workbenchRouteCommands(slug: string) {
    const projectId = this.projectId()
    return projectId ? ['/chat/x', slug, 'p', projectId, 'c'] : ['/chat/x', slug, 'c']
  }

  private workbenchRoutePath(slug: string) {
    const projectId = this.projectId()
    return projectId
      ? `/chat/x/${encodeURIComponent(slug)}/p/${encodeURIComponent(projectId)}/c`
      : `/chat/x/${encodeURIComponent(slug)}/c`
  }

  private isConversationEntryRoute() {
    const slug = this.slug()
    if (!slug) {
      return false
    }

    const projectId = this.projectId()
    const expectedPath = projectId
      ? `/chat/x/${encodeURIComponent(slug)}/p/${encodeURIComponent(projectId)}/c`
      : `/chat/x/${encodeURIComponent(slug)}/c`
    return this.currentUrl() === expectedPath
  }
}

function normalizeWorkbenchPath(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function parseWorkbenchSlug(url: string) {
  const match = normalizeWorkbenchPath(url).match(/^\/chat\/x\/([^/]+)\/(?:p\/[^/]+\/)?c(?:\/|$)/)
  return match?.[1] ? safeDecodeURIComponent(match[1]) : null
}

function parseWorkbenchProjectId(url: string) {
  const match = normalizeWorkbenchPath(url).match(/^\/chat\/x\/[^/]+\/p\/([^/]+)\/c(?:\/|$)/)
  return match?.[1] ? safeDecodeURIComponent(match[1]) : null
}

function parseWorkbenchThreadId(url: string) {
  const match = normalizeWorkbenchPath(url).match(/^\/chat\/x\/[^/]+\/(?:p\/[^/]+\/)?c\/([^/]+)$/)
  return match?.[1] ? safeDecodeURIComponent(match[1]) : null
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeThreadId(value?: string | null) {
  const normalized = value?.trim()
  return normalized || null
}

function normalizeXperts(items: IXpert[] | { items?: IXpert[] } | null | undefined) {
  const seen = new Set<string>()
  const candidates = Array.isArray(items) ? items : Array.isArray(items?.items) ? items.items : []

  return candidates.filter((xpert): xpert is IXpert => {
    if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) {
      return false
    }

    seen.add(xpert.id)
    return true
  })
}
