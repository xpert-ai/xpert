import { CommonModule } from '@angular/common'
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, NgZone, computed, effect, inject, input, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { Observable, combineLatest, forkJoin, merge, of } from 'rxjs'
import { catchError, distinctUntilChanged, exhaustMap, filter, map, startWith, switchMap } from 'rxjs/operators'
import {
  AIPermissionsEnum,
  AiFeatureEnum,
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  ChatConversationService,
  IChatConversationUnreadXpertSummary,
  IAssistantBinding,
  IXpert,
  RequestScopeLevel,
  ScopeService,
  Store,
  XpertAPIService
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar/emoji-avatar/avatar.component'
import { getAssistantRegistryItem } from '../assistant/assistant.registry'
import {
  filterAssistantXperts,
  getAssistantDescription,
  getAssistantLabel,
  getAssistantRouteId,
  getAssistantTagNames,
  isAssistantRouteActive,
  normalizeAssistantXperts,
  orderAssistantXperts
} from './cloud-sidebar-assistants.utils'

export type CloudSidebarAssistantState = {
  items: IXpert[]
  binding: IAssistantBinding | null
}

export type CloudSidebarAssistantsMode = 'list' | 'current-card'

const EMPTY_ASSISTANT_STATE: CloudSidebarAssistantState = {
  items: [],
  binding: null
}

const DEFAULT_VISIBLE_ASSISTANT_COUNT = 5
const UNREAD_POLL_INTERVAL_MS = 2_000
const ALL_ASSISTANT_CATEGORY = 'all'
const ASSISTANT_ORDER_STORAGE_KEY = 'xpert.cloud-sidebar.assistant-order'
const SYSTEM_ASSISTANT_SCOPE_CODE = AssistantCode.CHAT_COMMON
const CLAWXPERT_SETUP_URL = '/chat/clawxpert'

@Component({
  standalone: true,
  selector: 'pac-cloud-sidebar-assistants',
  templateUrl: './cloud-sidebar-assistants.component.html',
  styleUrl: './cloud-sidebar-assistants.component.scss',
  imports: [
    CommonModule,
    DragDropModule,
    TranslateModule,
    EmojiAvatarComponent,
    ZardIconComponent,
    ...ZardTooltipImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarAssistantsComponent {
  readonly collapsed = input(false)
  readonly enabled = input(true)
  readonly mode = input<CloudSidebarAssistantsMode>('list')

  readonly expanded = signal(true)
  readonly moreExpanded = signal(false)
  readonly query = signal('')
  readonly category = signal(ALL_ASSISTANT_CATEGORY)

  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #ngZone = inject(NgZone)
  readonly #router = inject(Router)
  readonly #scopeService = inject(ScopeService)
  readonly #store = inject(Store)
  readonly #xpertAPI = inject(XpertAPIService)
  readonly #clawXpertDefinition = getAssistantRegistryItem(AssistantCode.CLAWXPERT)
  readonly #unreadPoll$ = new Observable<void>((subscriber) =>
    this.#ngZone.runOutsideAngular(() => {
      const documentRef = globalThis.document
      let intervalId: ReturnType<typeof setInterval> | null = null
      const emit = () => subscriber.next()
      const stop = () => {
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
      }
      const start = () => {
        if (!intervalId) {
          intervalId = setInterval(emit, UNREAD_POLL_INTERVAL_MS)
        }
      }

      if (!documentRef) {
        emit()
        start()
        return stop
      }

      const handleVisibilityChange = () => {
        if (documentRef.visibilityState === 'visible') {
          emit()
          start()
          return
        }

        stop()
      }

      handleVisibilityChange()
      documentRef.addEventListener('visibilitychange', handleVisibilityChange)

      return () => {
        stop()
        documentRef.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    })
  )

  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly selectedWorkspace = toSignal(this.#store.selectedWorkspace$, { initialValue: null })
  readonly featureContextHydrated = toSignal(this.#store.featureContextHydrated$, {
    initialValue: this.#store.featureContextHydrated
  })
  readonly activeScope = this.#scopeService.activeScope
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => normalizeChatPath(this.#router.url)),
      distinctUntilChanged()
    ),
    { initialValue: normalizeChatPath(this.#router.url) }
  )
  readonly isCurrentCardMode = computed(() => this.mode() === 'current-card')
  readonly request = computed(() => {
    const mode = this.mode()
    const activeScope = this.activeScope()
    const organizationId = this.organizationId()
    const isTenantScope = activeScope.level === RequestScopeLevel.TENANT
    const isOrganizationScope = activeScope.level === RequestScopeLevel.ORGANIZATION
    const hasRenderableScope =
      mode === 'current-card'
        ? isOrganizationScope && !!organizationId
        : isTenantScope || (isOrganizationScope && !!organizationId)
    const featureKeys =
      mode === 'current-card'
        ? (this.#clawXpertDefinition?.featureKeys ?? [
            AiFeatureEnum.FEATURE_XPERT,
            AiFeatureEnum.FEATURE_XPERT_CLAWXPERT
          ])
        : [AiFeatureEnum.FEATURE_XPERT]
    const enabled =
      this.enabled() &&
      hasRenderableScope &&
      this.featureContextHydrated() &&
      featureKeys.every((featureKey) => this.#store.hasFeatureEnabled(featureKey))

    return {
      organizationId,
      scopeLevel: activeScope.level,
      mode,
      enabled
    }
  })
  readonly #assistantOrder = signal<string[]>([])
  readonly #assistantOrderStorageKey = computed(() => {
    const request = this.request()
    const userId = this.#store.user?.id ?? this.#store.userId ?? 'anonymous'
    const scopeId = request.organizationId ?? request.scopeLevel

    return `${ASSISTANT_ORDER_STORAGE_KEY}:${userId}:${request.scopeLevel}:${scopeId}`
  })
  readonly #loadAssistantOrderEffect = effect(() => {
    this.#assistantOrder.set(readAssistantOrder(this.#assistantOrderStorageKey()))
  })
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ enabled, scopeLevel }) => {
        if (!enabled) {
          return of(EMPTY_ASSISTANT_STATE)
        }

        const isTenantListScope = scopeLevel === RequestScopeLevel.TENANT

        return merge(
          this.#xpertAPI.onRefresh(),
          this.#assistantBindingService.changes$.pipe(
            filter((event) => event.code === AssistantCode.CLAWXPERT && event.scope === AssistantBindingScope.USER)
          )
        ).pipe(
          switchMap(() => {
            const binding$ = isTenantListScope
              ? of(null)
              : this.#assistantBindingService
                  .get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
                  .pipe(catchError(() => of(null)))

            const items$ = isTenantListScope
              ? this.#assistantBindingService
                  .getAvailableXperts(AssistantBindingScope.TENANT, SYSTEM_ASSISTANT_SCOPE_CODE)
                  .pipe(catchError(() => of([] as IXpert[])))
              : this.#assistantBindingService
                  .getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
                  .pipe(catchError(() => of([] as IXpert[])))

            return forkJoin({
              binding: binding$,
              items: items$
            }).pipe(
              map(
                ({ binding, items }) =>
                  ({
                    binding,
                    items: normalizeAssistantXperts(items)
                  }) satisfies CloudSidebarAssistantState
              ),
              catchError(() => of(EMPTY_ASSISTANT_STATE))
            )
          }),
          startWith(EMPTY_ASSISTANT_STATE)
        )
      })
    ),
    { initialValue: EMPTY_ASSISTANT_STATE }
  )
  readonly xperts = computed(() => this.state().items)
  readonly binding = computed(() => this.state().binding)
  readonly boundXpert = computed(() => {
    const assistantId = this.binding()?.assistantId?.trim()
    if (!assistantId) {
      return null
    }

    return this.xperts().find((xpert) => xpert.id === assistantId) ?? null
  })
  readonly isClawXpertConfigured = computed(() => !!this.boundXpert())
  readonly listXperts = computed(() => {
    const boundId = this.boundXpert()?.id
    const items = this.xperts().filter((xpert) => xpert.id !== boundId)

    return orderAssistantXperts(items, this.#assistantOrder())
  })
  readonly categories = computed(() => {
    const categories: Array<{ value: string; labelKey?: string; labelDefault: string }> = [
      { value: ALL_ASSISTANT_CATEGORY, labelKey: 'PAC.Assistant.CategoryAll', labelDefault: 'All' }
    ]
    const seen = new Set<string>([ALL_ASSISTANT_CATEGORY])

    for (const xpert of this.listXperts()) {
      for (const tag of getAssistantTagNames(xpert)) {
        const label = tag.trim()
        const value = label.toLowerCase()
        if (!label || seen.has(value)) {
          continue
        }

        seen.add(value)
        categories.push({ value, labelDefault: label })
      }
    }

    return categories
  })
  readonly showCategoryFilters = computed(() => this.categories().length > 2)
  readonly activeCategory = computed(() => {
    if (!this.showCategoryFilters()) {
      return ALL_ASSISTANT_CATEGORY
    }

    const category = this.category()
    return this.categories().some((item) => item.value === category) ? category : ALL_ASSISTANT_CATEGORY
  })
  readonly filteredXperts = computed(() =>
    filterAssistantXperts(this.listXperts(), this.query(), this.activeCategory())
  )
  readonly hasAssistantFilter = computed(
    () => !!this.query().trim() || this.activeCategory() !== ALL_ASSISTANT_CATEGORY
  )
  readonly defaultVisibleXpertCount = computed(() => DEFAULT_VISIBLE_ASSISTANT_COUNT)
  readonly visibleXperts = computed(() => {
    const items = this.filteredXperts()
    if (this.hasAssistantFilter() || this.moreExpanded()) {
      return items
    }

    return items.slice(0, this.defaultVisibleXpertCount())
  })
  readonly hiddenAssistantCount = computed(() => {
    if (this.hasAssistantFilter()) {
      return 0
    }

    return Math.max(this.filteredXperts().length - this.defaultVisibleXpertCount(), 0)
  })
  readonly unreadXpertIdsRequest = computed(() => {
    if (this.isCurrentCardMode()) {
      return ''
    }

    const ids = this.listXperts()
      .map((xpert) => xpert.id)
      .filter((id): id is string => typeof id === 'string' && !!id.trim())

    return Array.from(new Set(ids.map((id) => id.trim()))).join('\n')
  })
  readonly unreadSummaries = toSignal(
    combineLatest([toObservable(this.request), toObservable(this.unreadXpertIdsRequest)]).pipe(
      switchMap(([request, xpertIdsRequest]) => {
        const xpertIds = xpertIdsRequest ? xpertIdsRequest.split('\n') : []
        if (!request.enabled || xpertIds.length === 0) {
          return of([])
        }

        return merge(this.#unreadPoll$, this.#conversationService.unreadRefresh$).pipe(
          exhaustMap(() => this.#conversationService.getUnreadByXperts(xpertIds).pipe(catchError(() => of([]))))
        )
      })
    ),
    { initialValue: [] }
  )
  readonly unreadSummaryList = computed(() => normalizeUnreadSummaries(this.unreadSummaries()))
  readonly unreadXpertIds = computed(
    () =>
      new Set(
        this.unreadSummaryList()
          .filter((summary) => summary.unreadMessages > 0)
          .map((summary) => summary.xpertId)
      )
  )
  readonly conversationSummaryByXpertId = computed(() => {
    const entries = this.unreadSummaryList().map((summary) => [summary.xpertId, summary] as const)

    return new Map<string, IChatConversationUnreadXpertSummary>(entries)
  })
  readonly unreadSummaryByXpertId = computed(() => {
    const entries = this.unreadSummaryList()
      .filter((summary) => summary.unreadMessages > 0)
      .map((summary) => [summary.xpertId, summary] as const)

    return new Map<string, IChatConversationUnreadXpertSummary>(entries)
  })
  readonly assistantCount = computed(() => this.listXperts().length)
  readonly shouldRender = computed(() => this.request().enabled)

  openClawXpert(event: Event) {
    event.stopPropagation()
    const boundXpert = this.boundXpert()
    if (!boundXpert) {
      this.openClawXpertSetup()
      return
    }

    const routeId = getAssistantRouteId(boundXpert)
    if (!routeId) {
      return
    }

    const unreadThreadId = this.getLatestUnreadThreadId(boundXpert.id)
    void this.#router.navigate(unreadThreadId ? ['/chat/x', routeId, 'c', unreadThreadId] : ['/chat/x', routeId, 'c'])
  }

  startClawXpertConversation(event: Event) {
    event.stopPropagation()
    if (!this.isClawXpertConfigured()) {
      this.openClawXpertSetup()
      return
    }

    void this.#router.navigate(['/chat/clawxpert', 'c'])
  }

  openClawXpertOverview(event: Event) {
    event.stopPropagation()
    if (!this.isClawXpertConfigured()) {
      this.openClawXpertSetup()
      return
    }

    void this.#router.navigateByUrl('/chat/clawxpert')
  }

  private openClawXpertSetup() {
    void this.#router.navigateByUrl(CLAWXPERT_SETUP_URL)
  }

  openAssistant(event: Event, xpert: IXpert) {
    event.stopPropagation()
    const routeId = getAssistantRouteId(xpert)
    if (!routeId) {
      return
    }

    const unreadThreadId = this.getLatestUnreadThreadId(xpert.id)
    void this.#router.navigate(unreadThreadId ? ['/chat/x', routeId, 'c', unreadThreadId] : ['/chat/x', routeId, 'c'])
  }

  openAssistantSettings(event: Event, xpert: IXpert) {
    event.stopPropagation()
    if (!this.canEditAssistant(xpert)) {
      return
    }

    const xpertId = xpert.id?.trim()
    if (!xpertId) {
      return
    }

    void this.#router.navigate(['/xpert/x', xpertId, 'agents'])
  }

  openCreateDigitalExpert(event: Event) {
    event.stopPropagation()
    const workspaceId = this.selectedWorkspace()?.id?.trim()

    void this.#router.navigate(workspaceId ? ['/xpert/w', workspaceId, 'xperts'] : ['/xpert/w'])
  }

  isActive(xpert: IXpert) {
    return isAssistantRouteActive(this.currentUrl(), xpert)
  }

  hasAssistantUnread(xpert: IXpert) {
    return this.hasUnread(xpert.id)
  }

  canEditAssistant(xpert: IXpert | null | undefined) {
    if (!xpert?.id || !this.hasXpertEditPermission()) {
      return false
    }

    const capabilities = xpert.workspace?.capabilities
    if (capabilities) {
      return capabilities.canWrite || capabilities.canManage
    }

    const currentUserId = this.#store.user?.id ?? this.#store.userId
    if (currentUserId && (xpert.createdById === currentUserId || xpert.workspace?.ownerId === currentUserId)) {
      return true
    }

    return !xpert.workspaceId
  }

  canCreateDigitalExpert() {
    return this.hasXpertEditPermission()
  }

  clawXpertLabel() {
    const boundXpert = this.boundXpert()
    return getAssistantLabel(boundXpert ?? {}) || this.#clawXpertDefinition?.defaultLabel || 'ClawXpert'
  }

  currentAssistantLabel() {
    return this.clawXpertLabel()
  }

  currentAssistantAvatar() {
    return this.clawXpertAvatar()
  }

  clawXpertDescription() {
    const boundXpert = this.boundXpert()
    if (boundXpert) {
      return getAssistantDescription(boundXpert)
    }

    return this.#clawXpertDefinition?.defaultDescription || 'Configure your personal assistant.'
  }

  clawXpertAvatar() {
    return this.boundXpert()?.avatar ?? null
  }

  assistantLabel(xpert: IXpert) {
    return getAssistantLabel(xpert)
  }

  assistantDescription(xpert: IXpert) {
    return this.getLatestConversationTitle(xpert.id) || getAssistantDescription(xpert)
  }

  updateQuery(event: Event) {
    this.query.set((event.target as HTMLInputElement | null)?.value ?? '')
  }

  toggleExpanded() {
    this.expanded.update((expanded) => !expanded)
  }

  toggleMore(event: Event) {
    event.stopPropagation()
    this.moreExpanded.update((expanded) => !expanded)
  }

  selectCategory(category: string) {
    this.category.set(category)
  }

  dropAssistant(event: CdkDragDrop<IXpert[]>) {
    this.reorderAssistants(event.previousIndex, event.currentIndex, event.container.data)
  }

  reorderAssistants(previousIndex: number, currentIndex: number, visibleItems = this.visibleXperts()) {
    if (
      previousIndex === currentIndex ||
      previousIndex < 0 ||
      currentIndex < 0 ||
      previousIndex >= visibleItems.length ||
      currentIndex >= visibleItems.length
    ) {
      return
    }

    const reorderedVisibleItems = [...visibleItems]
    moveItemInArray(reorderedVisibleItems, previousIndex, currentIndex)

    const visibleIds = new Set(
      reorderedVisibleItems.map((xpert) => xpert.id).filter((id): id is string => typeof id === 'string' && !!id.trim())
    )
    let reorderedVisibleIndex = 0
    const reorderedItems = this.listXperts().map((xpert) => {
      if (typeof xpert.id !== 'string' || !visibleIds.has(xpert.id)) {
        return xpert
      }

      return reorderedVisibleItems[reorderedVisibleIndex++] ?? xpert
    })
    const orderedIds = reorderedItems
      .map((xpert) => xpert.id)
      .filter((id): id is string => typeof id === 'string' && !!id.trim())

    this.#assistantOrder.set(orderedIds)
    writeAssistantOrder(this.#assistantOrderStorageKey(), orderedIds)
  }

  trackAssistant(index: number, xpert: IXpert) {
    return xpert.id || xpert.slug || index
  }

  private hasUnread(xpertId: string | null | undefined) {
    return typeof xpertId === 'string' && this.unreadXpertIds().has(xpertId)
  }

  private getLatestUnreadThreadId(xpertId: string | null | undefined) {
    if (typeof xpertId !== 'string' || !xpertId.trim()) {
      return null
    }

    const summary = this.unreadSummaryByXpertId().get(xpertId)
    const threadId = summary?.latestUnreadThreadId?.trim()
    return summary && summary.unreadMessages > 0 && threadId ? threadId : null
  }

  private getLatestConversationTitle(xpertId: string | null | undefined) {
    if (typeof xpertId !== 'string' || !xpertId.trim()) {
      return null
    }

    const title = this.conversationSummaryByXpertId().get(xpertId)?.latestConversationTitle?.trim()
    return title || null
  }

  private hasXpertEditPermission() {
    return this.#store.hasPermission(AIPermissionsEnum.XPERT_EDIT as never)
  }
}

function normalizeChatPath(url: string) {
  const [pathname] = (url || '/chat').split('?')
  if (!pathname || pathname === '/') {
    return '/chat'
  }

  return pathname.endsWith('/') && pathname.length > 1 ? pathname.slice(0, -1) : pathname
}

function normalizeUnreadSummaries(value: unknown): IChatConversationUnreadXpertSummary[] {
  if (Array.isArray(value)) {
    return value.filter(isUnreadSummary)
  }

  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: unknown[] }).items.filter(isUnreadSummary)
  }

  return []
}

function isUnreadSummary(value: unknown): value is IChatConversationUnreadXpertSummary {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as IChatConversationUnreadXpertSummary).xpertId === 'string' &&
    typeof (value as IChatConversationUnreadXpertSummary).unreadMessages === 'number'
  )
}

function readAssistantOrder(storageKey: string) {
  const storage = getLocalStorage()
  if (!storage) {
    return []
  }

  let value: unknown
  try {
    const storedValue = storage.getItem(storageKey)
    value = storedValue ? JSON.parse(storedValue) : []
  } catch {
    return []
  }

  if (!Array.isArray(value)) {
    return []
  }

  const orderedIds = value.filter((id): id is string => typeof id === 'string' && !!id.trim()).map((id) => id.trim())

  return Array.from(new Set(orderedIds))
}

function writeAssistantOrder(storageKey: string, orderedIds: string[]) {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  try {
    storage.setItem(storageKey, JSON.stringify(orderedIds))
  } catch {
    return
  }
}

function getLocalStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
