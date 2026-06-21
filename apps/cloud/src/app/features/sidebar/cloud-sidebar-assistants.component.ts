import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, NgZone, computed, inject, input, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
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
  type AssistantCategory,
  filterAssistantXperts,
  getAssistantDescription,
  getAssistantLabel,
  getAssistantRouteId,
  isAssistantRouteActive,
  normalizeAssistantXperts
} from './cloud-sidebar-assistants.utils'

export type CloudSidebarAssistantState = {
  items: IXpert[]
  binding: IAssistantBinding | null
  loading: boolean
}

const EMPTY_ASSISTANT_STATE: CloudSidebarAssistantState = {
  items: [],
  binding: null,
  loading: false
}

const CLAWXPERT_FALLBACK_ID = '__clawxpert__'

@Component({
  standalone: true,
  selector: 'pac-cloud-sidebar-assistants',
  templateUrl: './cloud-sidebar-assistants.component.html',
  styleUrl: './cloud-sidebar-assistants.component.scss',
  imports: [CommonModule, TranslateModule, EmojiAvatarComponent, ...ZardTooltipImports],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarAssistantsComponent {
  readonly collapsed = input(false)
  readonly enabled = input(true)

  readonly expanded = signal(true)
  readonly query = signal('')
  readonly category = signal<AssistantCategory>('all')
  readonly categories: Array<{ value: AssistantCategory; labelKey: string; labelDefault: string }> = [
    { value: 'all', labelKey: 'PAC.Assistant.CategoryAll', labelDefault: '全部' },
    { value: 'office', labelKey: 'PAC.Assistant.CategoryOffice', labelDefault: 'Office' },
    { value: 'data', labelKey: 'PAC.Assistant.CategoryData', labelDefault: '数据' },
    { value: 'mcp', labelKey: 'PAC.Assistant.CategoryMcp', labelDefault: 'MCP' },
    { value: 'personal', labelKey: 'PAC.Assistant.CategoryPersonal', labelDefault: '个人' }
  ]

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

        return forkJoin({
          binding: this.#assistantBindingService
            .get(AssistantCode.CLAWXPERT, AssistantBindingScope.USER)
            .pipe(catchError(() => of(null))),
          items: this.#assistantBindingService
            .getAvailableXperts(AssistantBindingScope.USER, AssistantCode.CLAWXPERT)
            .pipe(catchError(() => of([] as IXpert[])))
        }).pipe(
          map(
            ({ binding, items }) =>
              ({
                binding,
                items: normalizeAssistantXperts(items),
                loading: false
              }) satisfies CloudSidebarAssistantState
          ),
          startWith({
            items: [],
            binding: null,
            loading: true
          } satisfies CloudSidebarAssistantState),
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
  readonly xpertsWithoutClawXpert = computed(() => {
    const boundId = this.boundXpert()?.id
    return boundId ? this.xperts().filter((xpert) => xpert.id !== boundId) : this.xperts()
  })
  readonly filteredXperts = computed(() =>
    filterAssistantXperts(this.xpertsWithoutClawXpert(), this.query(), this.category())
  )
  readonly unreadXpertIdsRequest = computed(() => {
    const ids = [this.boundXpert()?.id, ...this.xpertsWithoutClawXpert().map((xpert) => xpert.id)].filter(
      (id): id is string => typeof id === 'string' && !!id.trim()
    )

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
  readonly clawXpertSearchItem = computed<AssistantXpertLike>(() => {
    const boundXpert = this.boundXpert()
    const label = this.clawXpertLabel()
    const description = this.clawXpertDescription()

    return {
      ...(boundXpert ?? {}),
      id: boundXpert?.id ?? CLAWXPERT_FALLBACK_ID,
      slug: boundXpert?.slug ?? 'clawxpert',
      name: boundXpert?.name ?? label,
      title: label,
      description: [description, 'ClawXpert', 'personal', '个人', '配置'].filter(Boolean).join(' '),
      tags: [{ name: 'clawxpert' }, { name: 'personal' }, ...(boundXpert?.tags ?? [])]
    }
  })
  readonly showClawXpertEntry = computed(() => {
    return (
      this.request().enabled &&
      filterAssistantXperts([this.clawXpertSearchItem()], this.query(), this.category()).length > 0
    )
  })
  readonly assistantCount = computed(() => this.xpertsWithoutClawXpert().length + (this.request().enabled ? 1 : 0))
  readonly activeXpert = computed(() => this.xperts().find((xpert) => this.isActive(xpert)) ?? null)
  readonly headerSubtitle = computed(() => {
    if (this.isClawXpertActive()) {
      return this.clawXpertLabel()
    }

    const activeXpert = this.activeXpert()
    if (activeXpert) {
      return this.assistantLabel(activeXpert)
    }

    return this.assistantLabel(this.xperts()[0]) || ''
  })
  readonly shouldRender = computed(() => {
    const state = this.state()

    return this.request().enabled && (state.loading || state.items.length > 0 || this.showClawXpertEntry())
  })

  openClawXpert(event: Event) {
    event.stopPropagation()
    const boundXpert = this.boundXpert()
    if (!boundXpert) {
      void this.#router.navigateByUrl('/chat/clawxpert')
      return
    }

    const unreadThreadId = this.getLatestUnreadThreadId(boundXpert.id)
    void this.#router.navigate(unreadThreadId ? ['/chat/clawxpert', 'c', unreadThreadId] : ['/chat/clawxpert', 'c'])
  }

  openClawXpertSettings(event: Event) {
    event.stopPropagation()
    if (!this.canConfigureClawXpert()) {
      return
    }

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

  isClawXpertActive() {
    const url = this.currentUrl()
    const boundXpert = this.boundXpert()

    return isClawXpertRoute(url) || (!!boundXpert && isAssistantRouteActive(url, boundXpert))
  }

  hasClawXpertUnread() {
    return this.hasUnread(this.boundXpert()?.id)
  }

  hasAssistantUnread(xpert: IXpert) {
    return this.hasUnread(xpert.id)
  }

  canConfigureClawXpert() {
    const boundXpert = this.boundXpert()
    return !boundXpert || this.canEditAssistant(boundXpert)
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

  selectCategory(category: AssistantCategory) {
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

function isClawXpertRoute(url: string) {
  return /^\/chat\/clawxpert(?:\/|$)/.test(normalizeChatPath(url))
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
