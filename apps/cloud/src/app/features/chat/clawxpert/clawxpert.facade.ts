import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { environment } from '@cloud/environments/environment'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl } from '@xpert-ai/chatkit-angular'
import { firstValueFrom, of } from 'rxjs'
import { catchError, filter, map, startWith, switchMap } from 'rxjs/operators'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  IAssistantBinding,
  IAssistantBindingUserPreference,
  IAssistantBindingUserPreferenceUpsertInput,
  IXpert,
  IXpertTask,
  OrderTypeEnum,
  Store,
  ToastrService,
  XpertAPIService,
  XpertTaskService,
  getErrorMessage
} from '../../../@core'
import {
  sanitizeAssistantFrameUrl
} from '../../assistant/assistant-chatkit.runtime'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'

export type ClawXpertViewState = 'organization-required' | 'wizard' | 'ready' | 'error'

export type ClawXpertDailyConversation = {
  date: string
  count: number
}

type ClawXpertTaskSummary = {
  items: IXpertTask[]
  total: number
}

type XpertCollection = IXpert[] | { items?: IXpert[] } | null | undefined

const HEATMAP_DAY_COUNT = 84
const ALL_TIME_START = '2000-01-01'

@Injectable()
export class ClawXpertFacade {
  #loadRequestId = 0
  #preferenceLoadRequestId = 0
  #nullThreadChangeGuard: { threadId: string | null; expiresAt: number } = {
    threadId: null,
    expiresAt: 0
  }

  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #store = inject(Store)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #router = inject(Router)
  readonly #xpertService = inject(XpertAPIService)
  readonly #taskService = inject(XpertTaskService)

  readonly definition = getAssistantRegistryItem(AssistantCode.CLAWXPERT)!
  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => normalizeClawXpertPath(this.#router.url))
    ),
    { initialValue: normalizeClawXpertPath(this.#router.url) }
  )
  readonly threadId = computed(() => parseClawXpertThreadId(this.currentUrl()))
  readonly preference = signal<IAssistantBinding | null>(null)
  readonly userPreference = signal<IAssistantBindingUserPreference | null>(null)
  readonly availableXperts = signal<IXpert[]>([])
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly clearing = signal(false)
  readonly loadingUserPreference = signal(false)
  readonly savingUserPreference = signal(false)
  readonly showWizard = signal(false)
  readonly pendingConversationStartId = signal(0)
  readonly errorMessage = signal<string | null>(null)
  readonly hasLoadedXperts = signal(false)
  readonly chatkitFrameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))
  readonly resolvedPreference = computed(() => {
    const preference = this.preference()
    if (!preference) {
      return null
    }
    if (!this.hasLoadedXperts()) {
      return preference
    }

    return this.availableXperts().some((item) => item.id === preference.assistantId) ? preference : null
  })
  readonly orphanedPreference = computed(() => {
    return !!this.preference() && this.hasLoadedXperts() && !this.resolvedPreference()
  })
  readonly currentXpert = computed(() => {
    const assistantId = this.resolvedPreference()?.assistantId
    return assistantId ? this.availableXperts().find((item) => item.id === assistantId) ?? null : null
  })
  readonly xpertId = computed(() => this.currentXpert()?.id ?? this.resolvedPreference()?.assistantId ?? null)
  readonly currentXpertLabel = computed(() => {
    return this.getXpertLabel(this.currentXpert() ?? this.resolvedPreference())
  })
  readonly currentXpertDescription = computed(() => {
    return (
      this.currentXpert()?.description ||
      this.#translate.instant('PAC.Chat.ClawXpert.NoDescription', {
        Default: 'This assistant does not have a public description yet.'
      })
    )
  })
  readonly viewState = computed<ClawXpertViewState>(() => {
    if (!this.organizationId()) {
      return 'organization-required'
    }
    if (!this.chatkitFrameUrl()) {
      return 'error'
    }
    if (this.errorMessage()) {
      return 'error'
    }
    if (this.showWizard() || !this.resolvedPreference()) {
      return 'wizard'
    }
    return 'ready'
  })
  readonly boundDays = computed(() => calculateBoundDays(this.preference()?.createdAt))
  readonly conversationCount = toSignal(
    toObservable(this.xpertId).pipe(
      switchMap((xpertId: string | null) =>
        xpertId
          ? this.#xpertService.getConversations(xpertId, { take: 1 }, buildAllTimeRange()).pipe(
              map(({ total }) => total ?? 0),
              catchError(() => of(0))
            )
          : of(0)
      )
    ),
    { initialValue: 0 }
  )
  readonly dailyMessageSeries = toSignal(
    toObservable(this.xpertId).pipe(
      switchMap((xpertId: string | null) =>
        xpertId
          ? this.#xpertService.getDailyMessages(xpertId, buildHeatmapRange(), { currentUserOnly: true }).pipe(
              map((items: Array<{ date: string; count?: number }>) => normalizeDailyConversations(items)),
              catchError(() => of([] as ClawXpertDailyConversation[]))
            )
          : of([] as ClawXpertDailyConversation[])
      )
    ),
    { initialValue: [] as ClawXpertDailyConversation[] }
  )
  readonly taskSummary = toSignal(
    toObservable(this.xpertId).pipe(
      switchMap((xpertId) =>
        xpertId
          ? this.#taskService
              .getMyAll({
                relations: ['xpert', 'conversations'],
                order: { updatedAt: OrderTypeEnum.DESC },
                take: 5,
                where: { xpertId } as never
              })
              .pipe(
                map(({ items, total }) => ({
                  items: items ?? [],
                  total: total ?? items?.length ?? 0
                })),
                catchError(() => of({ items: [], total: 0 } satisfies ClawXpertTaskSummary))
              )
          : of({ items: [], total: 0 } satisfies ClawXpertTaskSummary)
      )
    ),
    { initialValue: { items: [], total: 0 } satisfies ClawXpertTaskSummary }
  )
  readonly recentTasks = computed(() => this.taskSummary().items ?? [])
  readonly taskCount = computed(() => this.taskSummary().total ?? this.recentTasks().length)

  constructor() {
    effect(() => {
      const organizationId = this.organizationId()

      if (!organizationId) {
        this.#loadRequestId++
        this.preference.set(null)
        this.userPreference.set(null)
        this.availableXperts.set([])
        this.errorMessage.set(null)
        this.showWizard.set(false)
        this.hasLoadedXperts.set(false)
        this.loading.set(false)
        this.loadingUserPreference.set(false)
        return
      }

      void this.loadState()
    })

    effect(() => {
      const organizationId = this.organizationId()
      const bindingId = this.preference()?.id

      if (!organizationId || !bindingId) {
        this.#preferenceLoadRequestId++
        this.userPreference.set(null)
        this.loadingUserPreference.set(false)
        return
      }

      void this.loadUserPreference()
    })
  }

  openWizard() {
    this.navigateToOverview()
    this.showWizard.set(true)
    this.errorMessage.set(null)
  }

  cancelWizard() {
    if (!this.resolvedPreference()) {
      return
    }

    this.showWizard.set(false)
    this.errorMessage.set(null)
  }

  async savePreference(assistantId: string) {
    this.saving.set(true)
    try {
      const preference = (await firstValueFrom(
        this.#assistantBindingService.upsert({
          code: AssistantCode.CLAWXPERT,
          scope: AssistantBindingScope.USER,
          assistantId
        })
      )) as IAssistantBinding

      this.preference.set(preference)
      this.showWizard.set(false)
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.SaveFailed', {
            Default: 'Failed to save the ClawXpert binding.'
          })
      )
    } finally {
      this.saving.set(false)
    }
  }

  async clearPreference() {
    this.clearing.set(true)
    try {
      await firstValueFrom(this.#assistantBindingService.delete(AssistantCode.CLAWXPERT, AssistantBindingScope.USER))
      this.preference.set(null)
      this.userPreference.set(null)
      this.showWizard.set(true)
      this.navigateToOverview()
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.DeleteFailed', {
            Default: 'Failed to clear the ClawXpert binding.'
          })
      )
    } finally {
      this.clearing.set(false)
    }
  }

  async saveUserPreference(input: Pick<IAssistantBindingUserPreferenceUpsertInput, 'soul' | 'profile'>) {
    this.savingUserPreference.set(true)
    try {
      const preference = (await firstValueFrom(
        this.#assistantBindingService.upsertPreference(AssistantCode.CLAWXPERT, {
          scope: AssistantBindingScope.USER,
          soul: input.soul ?? '',
          profile: input.profile ?? ''
        })
      )) as IAssistantBindingUserPreference

      this.userPreference.set(preference)
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
      return preference
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.PreferenceSaveFailed', {
            Default: 'Failed to save the ClawXpert markdown documents.'
          })
      )
      return null
    } finally {
      this.savingUserPreference.set(false)
    }
  }

  async startConversation() {
    const startId = this.pendingConversationStartId() + 1
    this.pendingConversationStartId.set(startId)
    await this.navigateToChat()
  }

  navigateToOverview() {
    if (this.currentUrl() === '/chat/clawxpert') {
      return
    }

    void this.#router.navigate(['/chat/clawxpert'])
  }

  async navigateToChat() {
    if (this.currentUrl() === '/chat/clawxpert/c') {
      return
    }

    await this.#router.navigate(['/chat/clawxpert', 'c'])
  }

  navigateToThread(threadId: string) {
    if (this.threadId() === threadId && this.currentUrl() === `/chat/clawxpert/c/${encodeURIComponent(threadId)}`) {
      return
    }

    void this.#router.navigate(['/chat/clawxpert', 'c', threadId])
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

  getXpertLabel(xpert: Partial<IXpert> | Partial<IAssistantBinding> | null | undefined) {
    if (!xpert) {
      return ''
    }

    return (
      ('title' in xpert ? xpert.title : null) ||
      ('titleCN' in xpert ? xpert.titleCN : null) ||
      ('name' in xpert ? xpert.name : null) ||
      ('slug' in xpert ? xpert.slug : null) ||
      ('assistantId' in xpert ? xpert.assistantId : null) ||
      ('id' in xpert ? xpert.id : null) ||
      ''
    )
  }

  viewErrorMessage() {
    if (!this.chatkitFrameUrl()) {
      return this.#translate.instant('PAC.Chat.ClawXpert.FrameMissing', {
        Default: 'CHATKIT_FRAME_URL is not configured for ClawXpert.'
      })
    }

    return (
      this.errorMessage() ||
      this.#translate.instant('PAC.Chat.ClawXpert.LoadFailedDesc', {
        Default: 'Check your assistant access and try again.'
      })
    )
  }

  onChatThreadChange(threadId: string | null) {
    this.handleThreadChange(threadId)
  }

  private handleThreadChange(threadId: string | null) {
    if (threadId === this.threadId()) {
      return
    }

    if (threadId) {
      this.armNullThreadChangeGuard(threadId)
      this.navigateToThread(threadId)
      return
    }

    if (this.shouldIgnoreNullThreadChange()) {
      return
    }

    void this.navigateToChat()
  }

  private armNullThreadChangeGuard(threadId: string) {
    this.#nullThreadChangeGuard = {
      threadId,
      expiresAt: Date.now() + 1000
    }
  }

  private shouldIgnoreNullThreadChange() {
    const activeThreadId = this.threadId()
    if (!activeThreadId) {
      return false
    }

    return (
      this.#nullThreadChangeGuard.threadId === activeThreadId &&
      this.#nullThreadChangeGuard.expiresAt > Date.now()
    )
  }

  private async loadState() {
    const requestId = ++this.#loadRequestId
    this.loading.set(true)
    this.errorMessage.set(null)
    this.hasLoadedXperts.set(false)

    try {
      const [preference, xperts] = await Promise.all([
        firstValueFrom(this.#assistantBindingService.get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)) as Promise<
          IAssistantBinding | null
        >,
        firstValueFrom(
          this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
        ) as Promise<XpertCollection>
      ])

      const normalizedXperts = this.normalizeXperts(xperts)
      const isCurrentBindingAvailable = preference
        ? normalizedXperts.some((item) => item.id === preference.assistantId)
        : false

      if (requestId !== this.#loadRequestId) {
        return
      }

      this.preference.set(preference ?? null)
      this.availableXperts.set(normalizedXperts)
      this.hasLoadedXperts.set(true)
      this.showWizard.set(!preference || !isCurrentBindingAvailable)
    } catch (error) {
      if (requestId !== this.#loadRequestId) {
        return
      }

      this.errorMessage.set(
        getErrorMessage(error) ||
          this.#translate.instant('PAC.Chat.ClawXpert.LoadFailedDesc', {
            Default: 'Check your assistant access and try again.'
          })
      )
    } finally {
      if (requestId === this.#loadRequestId) {
        this.loading.set(false)
      }
    }
  }

  private normalizeXperts(items: XpertCollection) {
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

  private async loadUserPreference() {
    const requestId = ++this.#preferenceLoadRequestId
    this.loadingUserPreference.set(true)

    try {
      const preference = (await firstValueFrom(
        this.#assistantBindingService.getPreference(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
      )) as IAssistantBindingUserPreference | null

      if (requestId !== this.#preferenceLoadRequestId) {
        return
      }

      this.userPreference.set(preference ?? null)
    } catch {
      if (requestId !== this.#preferenceLoadRequestId) {
        return
      }

      this.userPreference.set(null)
    } finally {
      if (requestId === this.#preferenceLoadRequestId) {
        this.loadingUserPreference.set(false)
      }
    }
  }
}

function normalizeClawXpertPath(url: string) {
  const [pathname] = url.split('?')
  if (!pathname || pathname === '/') {
    return '/chat/clawxpert'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function parseClawXpertThreadId(url: string) {
  const match = normalizeClawXpertPath(url).match(/^\/chat\/clawxpert\/c\/([^/]+)$/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function calculateBoundDays(createdAt?: Date | string | null) {
  if (!createdAt) {
    return 0
  }

  const start = new Date(createdAt)
  if (Number.isNaN(start.getTime())) {
    return 0
  }

  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  return Math.max(1, Math.floor(diffMs / 86400000) + 1)
}

function buildAllTimeRange() {
  return [ALL_TIME_START, formatDateKey(new Date())]
}

function buildHeatmapRange() {
  const end = new Date()
  end.setDate(end.getDate() + 1)
  const start = new Date()
  start.setDate(start.getDate() - (HEATMAP_DAY_COUNT - 1))
  return [formatDateKey(start), formatDateKey(end)]
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDailyConversations(items: Array<{ date: string; count?: number }> | null | undefined) {
  return (items ?? []).map((item) => ({
    date: item.date,
    count: Number(item.count ?? 0)
  }))
}
