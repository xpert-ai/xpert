import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { environment } from '@cloud/environments/environment'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { firstValueFrom, of } from 'rxjs'
import { catchError, filter, map, startWith } from 'rxjs/operators'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  IXpert,
  OrderTypeEnum,
  Store
} from '../../../@core'
import type { TXpertProjectAccessSummary } from '@xpert-ai/contracts'
import { sanitizeAssistantFrameUrl } from '../../assistant/assistant-chatkit.runtime'
import { XpertProjectApiService } from '../../project/project-api.service'
import { WorkbenchChatFacade, WorkbenchChatViewState } from '../workbench-chat/workbench-chat.facade'

@Injectable()
export class XpertWorkbenchFacade implements WorkbenchChatFacade {
  #loadRequestId = 0
  #projectAccessRequestId = 0
  #conversationEntryRequestId = 0
  #lastConversationEntryKey: string | null = null
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #projectApi = inject(XpertProjectApiService)

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
  readonly projectId = computed(() => parseWorkbenchProjectId(this.currentUrl()))
  readonly projectAccess = signal<TXpertProjectAccessSummary | null>(null)
  readonly threadId = computed(() => parseWorkbenchThreadId(this.currentUrl()))
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
  readonly xpertId = computed(() => this.currentXpert()?.id ?? null)
  readonly assistantId = computed(() => this.xpertId())
  readonly initialLayout = computed(() => this.currentXpert()?.options?.workbench?.initialLayout ?? null)
  readonly defaultViewKey = computed(() => this.currentXpert()?.options?.workbench?.defaultViewKey?.trim() || null)
  readonly identity = computed(() => {
    const xpertId = this.xpertId()
    const projectId = this.projectId()
    return xpertId ? `chat-xpert-workbench:${xpertId}:${projectId ?? 'personal'}` : null
  })
  readonly viewState = computed<WorkbenchChatViewState>(() => {
    if (!this.organizationId()) {
      return 'organization-required'
    }
    if (!this.chatkitFrameUrl()) {
      return 'error'
    }
    if (this.errorMessage()) {
      return 'error'
    }
    if (!this.currentXpert()) {
      return 'wizard'
    }

    return 'ready'
  })

  constructor() {
    effect(() => {
      const organizationId = this.organizationId()
      const slug = this.slug()

      if (!organizationId) {
        this.#loadRequestId++
        this.availableXperts.set([])
        this.errorMessage.set(null)
        this.loading.set(false)
        this.activeConversation.set(null)
        this.suppressAutoResume.set(false)
        return
      }

      void this.loadState(slug)
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

      if (!organizationId || !projectId) {
        return
      }

      void this.loadProjectAccess(projectId, requestId)
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
      this.#translate.instant('XP.Chat.XpertWorkbench.LoadFailedDesc', {
        Default: 'This xpert is unavailable or you do not have access.'
      })
    )
  }

  onChatThreadChange(threadId: string | null) {
    this.handleThreadChange(threadId)
  }

  onChatProjectChange(projectId: string | null) {
    const normalizedProjectId = projectId?.trim() || null
    if (normalizedProjectId === this.projectId()) {
      return
    }

    const slug = this.currentXpert()?.slug ?? this.slug()
    if (!slug) {
      return
    }

    this.suppressAutoResume.set(true)
    this.activeConversation.set(null)
    this.#projectAccessRequestId++
    this.projectAccess.set(null)
    const commands = normalizedProjectId ? ['/chat/x', slug, 'p', normalizedProjectId, 'c'] : ['/chat/x', slug, 'c']
    void this.#router.navigate(commands, { queryParamsHandling: 'preserve' })
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

    const entryKey = `${xpertId}:${this.projectId() ?? 'personal'}:${this.suppressAutoResume() ? 'suppressed' : 'resume'}`
    if (this.#lastConversationEntryKey === entryKey) {
      return
    }

    this.#lastConversationEntryKey = entryKey
    const requestId = ++this.#conversationEntryRequestId

    if (this.suppressAutoResume()) {
      await control.focusComposer()
      return
    }

    const threadId = await this.getLatestConversationThreadId(xpertId)
    if (requestId !== this.#conversationEntryRequestId || !this.isConversationEntryRoute() || this.threadId()) {
      return
    }

    if (threadId) {
      this.navigateToThread(threadId)
      return
    }

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

  private async loadState(slug: string | null) {
    const requestId = ++this.#loadRequestId
    this.loading.set(true)
    this.errorMessage.set(null)

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

  private async getLatestConversationThreadId(xpertId: string) {
    const projectId = this.projectId()
    const result = (await firstValueFrom(
      this.#conversationService
        .findAllByXpert(xpertId, {
          take: 1,
          where: projectId ? { projectId } : { projectId: { $isNull: true } },
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
        .pipe(catchError(() => of({ items: [] as IChatConversation[] })))
    )) as { items?: IChatConversation[] } | null

    return normalizeThreadId(result?.items?.[0]?.threadId)
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
