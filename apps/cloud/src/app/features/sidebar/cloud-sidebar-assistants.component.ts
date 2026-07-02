import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, NgZone, computed, inject, input, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { Observable, combineLatest, forkJoin, merge, of } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
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
  Store
} from '../../@core'
import { EmojiAvatarComponent } from '../../@shared/avatar/emoji-avatar/avatar.component'
import { getAssistantRegistryItem } from '../assistant/assistant.registry'
import {
  type AssistantXpertLike,
  filterAssistantXperts,
  getAssistantDescription,
  getAssistantLabel,
  getAssistantRouteId,
  getAssistantTagNames,
  isAssistantRouteActive,
  normalizeAssistantXperts
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
const ALL_ASSISTANT_CATEGORY = 'all'

@Component({
  standalone: true,
  selector: 'pac-cloud-sidebar-assistants',
  templateUrl: './cloud-sidebar-assistants.component.html',
  styleUrl: './cloud-sidebar-assistants.component.scss',
  imports: [CommonModule, TranslateModule, EmojiAvatarComponent, ZardIconComponent, ...ZardTooltipImports],
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
  readonly #store = inject(Store)
  readonly #clawXpertDefinition = getAssistantRegistryItem(AssistantCode.CLAWXPERT)
  readonly #unreadPoll$ = new Observable<number>((subscriber) =>
    this.#ngZone.runOutsideAngular(() => {
      subscriber.next(0)
      const intervalId = setInterval(() => subscriber.next(Date.now()), 30_000)

      return () => clearInterval(intervalId)
    })
  )

  readonly organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly featureContextHydrated = toSignal(this.#store.featureContextHydrated$, {
    initialValue: this.#store.featureContextHydrated
  })
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
    const organizationId = this.organizationId()
    const enabled =
      this.enabled() &&
      !!organizationId &&
      this.featureContextHydrated() &&
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) &&
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT)

    return {
      organizationId,
      enabled
    }
  })
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ enabled }) => {
        if (!enabled) {
          return of(EMPTY_ASSISTANT_STATE)
        }

        const binding$ = this.#assistantBindingService
          .get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
          .pipe(catchError(() => of(null)))

        const items$ = this.#assistantBindingService
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
          startWith(EMPTY_ASSISTANT_STATE),
          catchError(() => of(EMPTY_ASSISTANT_STATE))
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
  readonly listXperts = computed(() => {
    const boundId = this.boundXpert()?.id
    return this.xperts().filter((xpert) => xpert.id !== boundId && !isClawXpertXpert(xpert))
  })
  readonly categories = computed(() => {
    const categories: Array<{ value: string; labelKey?: string; labelDefault: string }> = [
      { value: ALL_ASSISTANT_CATEGORY, labelKey: 'PAC.Assistant.CategoryAll', labelDefault: '全部' }
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
  readonly activeCategory = computed(() => {
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
    combineLatest([
      toObservable(this.request),
      toObservable(this.unreadXpertIdsRequest),
      merge(this.#unreadPoll$, this.#conversationService.unreadRefresh$)
    ]).pipe(
      switchMap(([request, xpertIdsRequest]) => {
        const xpertIds = xpertIdsRequest ? xpertIdsRequest.split('\n') : []
        if (!request.enabled || xpertIds.length === 0) {
          return of([])
        }

        return this.#conversationService.getUnreadByXperts(xpertIds).pipe(catchError(() => of([])))
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
      void this.#router.navigateByUrl('/chat/clawxpert')
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
    const hasBinding = !!this.binding()?.assistantId?.trim()
    void (hasBinding ? this.#router.navigate(['/chat/clawxpert', 'c']) : this.#router.navigateByUrl('/chat/clawxpert'))
  }

  openClawXpertOverview(event: Event) {
    event.stopPropagation()
    void this.#router.navigateByUrl('/chat/clawxpert')
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
    return getAssistantDescription(xpert)
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

function isClawXpertXpert(xpert: AssistantXpertLike) {
  return [xpert.slug, xpert.id].some(
    (value) => typeof value === 'string' && value.trim().toLowerCase() === AssistantCode.CLAWXPERT
  )
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
