import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  OnInit,
  Renderer2,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import {
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterEvent,
  RouterOutlet
} from '@angular/router'
import {
  CurrentUserHydrationService,
  CURRENT_USER_BOOTSTRAP_RELATIONS,
  CURRENT_USER_BOOTSTRAP_SELECT,
  injectUserPreferences,
  UsersService
} from '@xpert-ai/cloud/state'
import type { IUserOrganization } from '@xpert-ai/cloud/state'
import { isNotEmpty, nonNullable } from '@xpert-ai/core'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { combineLatestWith, firstValueFrom } from 'rxjs'
import { filter, map, startWith, tap } from 'rxjs/operators'
import {
  AbilityActions,
  AIPermissionsEnum,
  AiFeatureEnum,
  EmployeesService,
  IOrganization,
  IRolePermission,
  RequestScopeLevel,
  ScopeService,
  IUser,
  MenuCatalog,
  Store,
  UsersOrganizationsService,
  XpertAPIService,
  XpertTypeEnum,
  routeAnimations
} from '../@core'
import { AppService } from '../app.service'
import {
  createFeatureEntryOnboardingSteps,
  FEATURE_ENTRY_ONBOARDING_GUIDE_KEY,
  getAvailableFeatureEntryOnboardingSteps,
  getFeatureEntryOnboardingFinishText,
  getFeatureEntryOnboardingOpenDelayMs,
  hasFeatureEntryOnboardingAutoShown,
  isFeatureEntryOnboardingBlocked,
  isFeatureEntryOnboardingScopeStep,
  shouldCreateClawXpertAfterEntryOnboarding,
  shouldExpandSidebarForEntryOnboarding,
  shouldShowFeatureEntryOnboardingForXpertCount,
  shouldAdvanceFeatureEntryOnboardingAfterScopeChange
} from './features-onboarding'
import { getFeatureMenus, syncMenuParentStateFromChildren } from './menus'
import { CloudMenuItem } from './sidebar/cloud-sidebar-menu.types'

function isWorkspaceRoute(url?: string | null) {
  return /^\/xpert\/w(?:\/|$)/.test(url?.split('?')[0] ?? '')
}

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  animations: [routeAnimations]
})
export class FeaturesComponent implements OnInit {
  MENU_CATALOG = MenuCatalog
  AbilityActions = AbilityActions
  readonly mainOutlet = viewChild<RouterOutlet>('o')

  readonly #destroyRef = inject(DestroyRef)
  readonly #preferences = injectUserPreferences()
  readonly #rolesService = inject(NgxRolesService)
  readonly #ngxPermissionsService = inject(NgxPermissionsService)
  readonly #usersService = inject(UsersService)
  readonly #currentUserHydrationService = inject(CurrentUserHydrationService)
  readonly #translateService = inject(TranslateService)
  readonly #renderer = inject(Renderer2)
  readonly #router = inject(Router)
  readonly #logger = inject(NGXLogger)
  readonly #appService = inject(AppService)
  readonly #employeeService = inject(EmployeesService)
  readonly #store = inject(Store)
  readonly #scopeService = inject(ScopeService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #usersOrganizationsService = inject(UsersOrganizationsService)
  readonly appService = this.#appService
  readonly activeScope = this.#scopeService.activeScope

  // States
  readonly sidebarCollapsed = signal(true)
  readonly entryOnboardingOpen = signal(false)
  readonly entryOnboardingCurrent = signal(0)
  readonly entryOnboardingAllSteps = signal(this.createEntryOnboardingSteps())
  readonly entryOnboardingSteps = signal(this.entryOnboardingAllSteps())
  readonly entryOnboardingBlocked = signal(false)
  readonly entryOnboardingXpertCount = signal<number | null>(null)
  readonly entryOnboardingManuallyRequested = signal(false)
  readonly entryOnboardingSidebarExpanded = signal(false)
  readonly entryOnboardingAutoRequestKey = signal<string | null>(null)
  readonly entryOnboardingAutoMarkKey = signal<string | null>(null)
  readonly entryOnboardingFinishText = computed(() =>
    getFeatureEntryOnboardingFinishText(this.entryOnboardingXpertCount(), this.canCreateEntryOnboardingXpert())
  )
  readonly entryOnboardingVisible = computed(
    () =>
      this.entryOnboardingOpen() &&
      shouldShowFeatureEntryOnboardingForXpertCount(
        this.entryOnboardingXpertCount(),
        this.entryOnboardingManuallyRequested()
      ) &&
      !this.entryOnboardingBlocked() &&
      this.entryOnboardingSteps().length > 0
  )
  readonly renderedSidebarCollapsed = computed(() =>
    shouldExpandSidebarForEntryOnboarding(
      this.sidebarCollapsed(),
      this.entryOnboardingSidebarExpanded() || this.entryOnboardingVisible()
    )
  )
  readonly activeRouteUrl = signal(this.#router.url)
  readonly pendingRouteUrl = signal<string | null>(null)
  readonly disableContentRouteAnimations = computed(
    () => isWorkspaceRoute(this.activeRouteUrl()) || isWorkspaceRoute(this.pendingRouteUrl())
  )
  // readonly fixedLayoutSider = attrModel(this.#preferences, 'fixedLayoutSider')
  // readonly isSideMode = computed(() => !!this.fixedLayoutSider())

  isEmployee: boolean
  organization: IOrganization
  user: IUser

  readonly isMobile = this.#appService.isMobile
  get isAuthenticated() {
    return !!this.#store.user
  }
  assetsSearch = ''
  readonly fullscreenIndex$ = toSignal(this.#appService.fullscreenIndex$)
  public readonly isAuthenticated$ = this.#store.user$
  public readonly navigation$ = this.#appService.navigation$.pipe(
    filter(nonNullable),
    combineLatestWith(this.#translateService.stream('PAC.KEY_WORDS')),
    map(([navigation, i18n]) => {
      let catalogName: string
      let icon: string
      switch (navigation.catalog) {
        case MenuCatalog.Project:
          catalogName = i18n?.['Project'] ?? 'Project'
          icon = 'auto_stories'
          break
        case MenuCatalog.Stories:
          catalogName = i18n?.['STORY'] || 'Story'
          icon = 'auto_stories'
          break
        case MenuCatalog.Models:
          catalogName = i18n?.['MODEL'] || 'Model'
          // icon = 'database'
          icon = 'database'
          break
        case MenuCatalog.Settings:
          catalogName = i18n?.['SETTINGS'] || 'Settings'
          icon = 'manage_accounts'
          break
        case MenuCatalog.IndicatorApp:
          catalogName = i18n?.['IndicatorApp'] || 'Indicator App'
          icon = 'storefront'
          break
      }

      return {
        ...navigation,
        catalogName,
        icon
      }
    })
  )

  assetsInit = false
  readonly loading = signal(false)

  readonly title = this.#appService.title
  /**
   * @deprecated use Xpert Agent instead
   */
  readonly copilotEnabled$ = signal(false) // toSignal(this.#appService.copilotEnabled$)
  readonly user$ = toSignal(this.#store.user$)

  readonly selectedOrganization$ = this.#store.selectedOrganization$

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly menus = signal<CloudMenuItem[]>([])
  #entryOnboardingRefreshHandle: number | null = null
  #entryOnboardingOpenHandle: number | null = null
  #entryOnboardingObserver: MutationObserver | null = null
  #entryOnboardingScopeLevel = this.#scopeService.scopeLevel()

  constructor() {
    this.#router.events
      .pipe(filter((e: Event | RouterEvent): e is RouterEvent => e instanceof RouterEvent))
      .subscribe((e: RouterEvent) => {
        this.navigationInterceptor(e)
        this.scheduleEntryOnboardingRefresh()
      })

    afterNextRender(() => {
      this.refreshEntryOnboardingState()
      this.observeEntryOnboardingTargets()
    })

    this.#destroyRef.onDestroy(() => this.cancelEntryOnboardingOpen())
  }

  async ngOnInit() {
    await this._createEntryPoint()

    this.#store.user$
      .pipe(
        filter((user: IUser) => !!user),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe((value) => {
        this.checkForEmployee()
        this.#logger?.debug(value)
      })

    this.#store.userRolePermissions$
      .pipe(
        filter((permissions: IRolePermission[]) => isNotEmpty(permissions)),
        map((permissions) => permissions.map(({ permission }) => permission)),
        tap((permissions) => this.#ngxPermissionsService.loadPermissions(permissions)),
        combineLatestWith(
          this.#translateService.onLangChange.pipe(startWith(null)),
          this.selectedOrganization$,
          this.#store.selectActiveScope(),
          this.#store.featureTenant$,
          this.#store.featureOrganizations$,
          this.#store.featureContextHydrated$
        ),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe(([, , org, scope]) => {
        this.organization = org
        this.menus.set(getFeatureMenus(scope.level, org))
        this.loadItems()
        void this.maybeOpenEntryOnboardingGuide()
        if (this.shouldTrackEntryOnboardingTargets()) {
          this.reloadEntryOnboardingSteps()
          this.advanceEntryOnboardingAfterScopeChange(scope.level)
          this.scheduleEntryOnboardingRefresh()
        } else {
          this.#entryOnboardingScopeLevel = scope.level
        }
      })
  }

  /*
   * This is app entry point after login
   */
  private async _createEntryPoint() {
    const id = this.#store.userId
    if (!id) return
    const cachedUser = this.#store.user
    const hasHydratedUser =
      !!cachedUser &&
      Array.isArray(cachedUser?.organizations) &&
      Array.isArray(cachedUser?.role?.rolePermissions) &&
      !!cachedUser?.tenant

    this.user = hasHydratedUser
      ? cachedUser
      : await this.#usersService.getMe([...CURRENT_USER_BOOTSTRAP_RELATIONS], CURRENT_USER_BOOTSTRAP_SELECT, {
          currentOrganizationId: this.#store.organizationId ?? this.#store.lastOrganizationId,
          limitOrganizations: true
        })

    //When a new user registers & logs in for the first time, he/she does not have tenantId.
    //In this case, we have to redirect the user to the onboarding page to create their first organization, tenant, role.
    if (!this.user.tenantId) {
      this.#router.navigate(['/onboarding/tenant'])
      return
    }

    this.#store.user = this.user

    const memberships = (this.user.organizations ?? []).filter(
      (membership) =>
        membership.isActive !== false && !!membership.organization?.id && membership.organization.isActive !== false
    )
    const organizations = memberships.map(({ organization }) => organization)
    const preferredOrganizationId = memberships.find((membership) => membership.isDefault)?.organizationId ?? null

    this.#scopeService.initializeEntryScope(organizations, preferredOrganizationId)

    //tenant enabled/disabled features for relatives organizations
    const { tenant, role } = this.user
    const tenantFeatures = tenant?.featureOrganizations ?? []
    this.#store.featureTenant = tenantFeatures.filter((item) => !item.organizationId)
    this.#store.featureContextHydrated = Array.isArray(tenant?.featureOrganizations)
    this.#store.featureContextHydrationFailed = false
    if (this.#store.featureContextHydrated) {
      this.#store.featureContextHydrationLoading = false
    }

    //only enabled permissions assign to logged in user
    this.#store.userRolePermissions = role.rolePermissions.filter((permission) => permission.enabled)

    if (!this.#store.featureContextHydrated && !this.#store.featureContextHydrationLoading) {
      this.#store.featureContextHydrationLoading = true
      this.#store.featureContextHydrationFailed = false
      void this.hydrateCurrentUserContextInBackground(id)
    }
  }

  private async hydrateCurrentUserContextInBackground(userId: string) {
    try {
      await this.#currentUserHydrationService.getFeatureHydration()
    } catch (error) {
      this.#logger?.error(error)
      if (this.#store.userId !== userId) {
        return
      }
      this.#store.featureContextHydrationFailed = true
    } finally {
      this.#store.featureContextHydrationLoading = false
    }
  }

  private async loadEntryOnboardingEligibility(): Promise<number | null> {
    const userId = this.#store.userId
    if (!userId || !this.canCreateEntryOnboardingXpert()) {
      this.entryOnboardingXpertCount.set(null)
      return null
    }

    try {
      const result = await firstValueFrom(
        this.#xpertService.getMyAll({
          where: {
            createdById: userId,
            type: XpertTypeEnum.Agent,
            latest: true
          },
          take: 1
        })
      )
      const xpertCount = result.total ?? result.items?.length ?? null
      this.entryOnboardingXpertCount.set(xpertCount)
      return xpertCount
    } catch (error) {
      this.#logger.warn('Failed to load feature entry onboarding eligibility', error)
      this.entryOnboardingXpertCount.set(null)
      return null
    }
  }

  private canCreateEntryOnboardingXpert() {
    return (
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT) &&
      this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_CLAWXPERT) &&
      this.#store.hasPermission(AIPermissionsEnum.XPERT_EDIT)
    )
  }

  loadItems() {
    // ??
    this.menus.update((menus) => {
      return menus.map((item) => {
        this.refreshMenuItem(item)
        return item
      })
    })
  }

  refreshMenuItem(item: CloudMenuItem) {
    item.title = this.#translateService.instant('PAC.MENU.' + item.data.translationKey, {
      Default: item.title || item.data.translationKey
    })
    if (item.data.permissionKeys || item.data.hide) {
      const anyPermission = item.data.permissionKeys
        ? item.data.permissionKeys.reduce((permission, key) => {
            return !!this.#rolesService.getRole(key) || this.#store.hasPermission(key) || permission
          }, false)
        : true

      item.hidden = !anyPermission || (item.data.hide && item.data.hide())

      if (anyPermission && item.data.organizationShortcut) {
        item.hidden = !this.organization
        if (!item.hidden) {
          item.link = item.data.urlPrefix + this.organization.id + item.data.urlPostfix
        }
      }
    }

    // enabled/disabled features from here
    if (Object.prototype.hasOwnProperty.call(item.data, 'featureKey') && item.hidden !== true) {
      if (this.#store.featureContextHydrated) {
        const { featureKey } = item.data
        const disabled = Array.isArray(featureKey)
          ? !featureKey.every((key) => this.#store.hasFeatureEnabled(key))
          : !this.#store.hasFeatureEnabled(featureKey)
        item.hidden = disabled || (item.data.hide && item.data.hide())
      }
    }

    if (item.children) {
      item.children.forEach((childItem) => {
        this.refreshMenuItem(childItem)
      })

      syncMenuParentStateFromChildren(item)
    }
  }

  checkForEmployee() {
    const { tenantId, id: userId } = this.#store.user
    this.#employeeService.getEmployeeByUserId(userId, [], { tenantId }).then(({ success }) => {
      this.isEmployee = success
    })
  }

  toggleSidebar() {
    this.sidebarCollapsed.update((collapsed) => !collapsed)
  }

  onCollapsedChange(collapsed: boolean) {
    this.sidebarCollapsed.set(collapsed)
  }

  async onEntryOnboardingFinish() {
    const shouldCreateClawXpert = shouldCreateClawXpertAfterEntryOnboarding(
      await this.loadEntryOnboardingEligibility(),
      this.canCreateEntryOnboardingXpert()
    )

    this.entryOnboardingOpen.set(false)
    this.entryOnboardingManuallyRequested.set(false)
    this.entryOnboardingCurrent.set(0)

    if (!shouldCreateClawXpert) {
      return
    }

    void this.#router.navigate(['/chat/clawxpert'], {
      queryParams: {
        onboarding: 'clawxpert'
      }
    })
  }

  openEntryOnboardingGuide() {
    this.entryOnboardingCurrent.set(0)
    this.entryOnboardingXpertCount.set(null)
    this.entryOnboardingManuallyRequested.set(true)
    void this.loadEntryOnboardingEligibility()
    this.scheduleEntryOnboardingOpen()
  }

  private async maybeOpenEntryOnboardingGuide() {
    if (this.entryOnboardingOpen() || this.entryOnboardingManuallyRequested()) {
      return
    }

    const organizationId = this.currentEntryOnboardingOrganizationId()
    const userId = this.#store.userId
    const membership = this.currentEntryOnboardingMembership(organizationId)
    if (
      !organizationId ||
      !userId ||
      !membership ||
      !this.canCreateEntryOnboardingXpert() ||
      hasFeatureEntryOnboardingAutoShown(membership.preferences)
    ) {
      return
    }

    const requestKey = this.getEntryOnboardingAutoKey(userId, organizationId)
    if (this.entryOnboardingAutoRequestKey() === requestKey) {
      return
    }

    this.entryOnboardingAutoRequestKey.set(requestKey)
    const xpertCount = await this.loadEntryOnboardingEligibility()
    const latestMembership = this.currentEntryOnboardingMembership(organizationId)

    if (
      this.entryOnboardingAutoRequestKey() !== requestKey ||
      !latestMembership ||
      !shouldShowFeatureEntryOnboardingForXpertCount(xpertCount, false) ||
      hasFeatureEntryOnboardingAutoShown(latestMembership.preferences)
    ) {
      if (xpertCount === null && this.entryOnboardingAutoRequestKey() === requestKey) {
        this.entryOnboardingAutoRequestKey.set(null)
      }
      return
    }

    this.entryOnboardingCurrent.set(0)
    this.entryOnboardingManuallyRequested.set(false)
    this.scheduleEntryOnboardingOpen()
  }

  private currentEntryOnboardingOrganizationId() {
    const scope = this.activeScope()
    return scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : null
  }

  private currentEntryOnboardingMembership(organizationId = this.currentEntryOnboardingOrganizationId()) {
    return (
      this.user?.organizations?.find(
        (membership) => membership.organizationId === organizationId && membership.isActive !== false
      ) ?? null
    )
  }

  private getEntryOnboardingAutoKey(userId: string, organizationId: string) {
    return `${userId}:${organizationId}:${FEATURE_ENTRY_ONBOARDING_GUIDE_KEY}`
  }

  private async markEntryOnboardingAutoShownIfVisible() {
    const organizationId = this.currentEntryOnboardingOrganizationId()
    const userId = this.#store.userId
    const membership = this.currentEntryOnboardingMembership(organizationId)

    if (
      this.entryOnboardingManuallyRequested() ||
      !this.entryOnboardingVisible() ||
      !organizationId ||
      !userId ||
      !membership ||
      hasFeatureEntryOnboardingAutoShown(membership.preferences)
    ) {
      return
    }

    const markKey = this.getEntryOnboardingAutoKey(userId, organizationId)
    if (this.entryOnboardingAutoMarkKey() === markKey) {
      return
    }

    this.entryOnboardingAutoMarkKey.set(markKey)
    try {
      const updatedMembership = await this.#usersOrganizationsService.markEntryGuideAutoShown(
        FEATURE_ENTRY_ONBOARDING_GUIDE_KEY
      )
      this.updateCurrentUserOrganizationMembership(updatedMembership)
    } catch (error) {
      this.#logger.warn('Failed to mark feature entry onboarding as shown', error)
      if (this.entryOnboardingAutoMarkKey() === markKey) {
        this.entryOnboardingAutoMarkKey.set(null)
      }
    }
  }

  private updateCurrentUserOrganizationMembership(membership: IUserOrganization) {
    if (!membership?.id) {
      return
    }

    const currentUser = this.#store.user
    if (!currentUser?.organizations?.length) {
      return
    }

    this.#store.user = {
      ...currentUser,
      organizations: currentUser.organizations.map((item) =>
        item.id === membership.id
          ? {
              ...item,
              ...membership,
              organization: membership.organization ?? item.organization
            }
          : item
      )
    }
    this.user = this.#store.user
  }

  entryOnboardingRequiresOrganizationSwitch(current: number) {
    return (
      this.activeScope().level === RequestScopeLevel.TENANT &&
      isFeatureEntryOnboardingScopeStep(this.entryOnboardingSteps()[current])
    )
  }

  openEntryOnboardingScopeSwitcher() {
    globalThis.document?.querySelector<HTMLElement>('[data-onboarding-target="scope-switcher"]')?.click()
  }

  onEntryOnboardingOpenChange(open: boolean) {
    this.entryOnboardingOpen.set(open)
    if (!open) {
      this.cancelEntryOnboardingOpen()
      this.entryOnboardingSidebarExpanded.set(false)
    }
  }

  private advanceEntryOnboardingAfterScopeChange(nextScopeLevel: RequestScopeLevel) {
    const previousScopeLevel = this.#entryOnboardingScopeLevel
    this.#entryOnboardingScopeLevel = nextScopeLevel

    const currentStep = this.entryOnboardingSteps()[this.entryOnboardingCurrent()]
    if (!shouldAdvanceFeatureEntryOnboardingAfterScopeChange(previousScopeLevel, nextScopeLevel, currentStep)) {
      return
    }

    this.entryOnboardingCurrent.set(Math.min(this.entryOnboardingCurrent() + 1, this.entryOnboardingSteps().length - 1))
  }

  private scheduleEntryOnboardingRefresh() {
    if (!this.shouldTrackEntryOnboardingTargets()) {
      return
    }

    if (this.#entryOnboardingRefreshHandle !== null) {
      return
    }

    this.#entryOnboardingRefreshHandle =
      globalThis.window?.setTimeout(() => {
        this.#entryOnboardingRefreshHandle = null
        this.refreshEntryOnboardingState()
      }, 0) ?? null

    if (this.#entryOnboardingRefreshHandle === null) {
      this.refreshEntryOnboardingState()
    }
  }

  private scheduleEntryOnboardingOpen() {
    this.cancelEntryOnboardingOpen()
    this.entryOnboardingSidebarExpanded.set(true)

    const open = () => {
      this.#entryOnboardingOpenHandle = null
      this.entryOnboardingOpen.set(true)
      this.reloadEntryOnboardingSteps()
      this.entryOnboardingSidebarExpanded.set(false)
      this.scheduleEntryOnboardingRefresh()
      void this.markEntryOnboardingAutoShownIfVisible()
    }
    const delayMs = getFeatureEntryOnboardingOpenDelayMs(this.sidebarCollapsed())

    if (delayMs <= 0 || typeof globalThis.window === 'undefined') {
      open()
      return
    }

    this.#entryOnboardingOpenHandle = globalThis.window.setTimeout(open, delayMs)
  }

  private cancelEntryOnboardingOpen() {
    if (this.#entryOnboardingOpenHandle === null) {
      return
    }

    globalThis.window?.clearTimeout(this.#entryOnboardingOpenHandle)
    this.#entryOnboardingOpenHandle = null
  }

  private refreshEntryOnboardingState() {
    if (!this.shouldTrackEntryOnboardingTargets()) {
      return
    }

    const availableSteps = getAvailableFeatureEntryOnboardingSteps(this.entryOnboardingAllSteps())
    const blocked = isFeatureEntryOnboardingBlocked()

    if (!sameEntryOnboardingSteps(this.entryOnboardingSteps(), availableSteps)) {
      this.entryOnboardingSteps.set(availableSteps)
    }

    if (this.entryOnboardingBlocked() !== blocked) {
      this.entryOnboardingBlocked.set(blocked)
    }

    if (this.entryOnboardingCurrent() >= availableSteps.length) {
      this.entryOnboardingCurrent.set(Math.max(availableSteps.length - 1, 0))
    }

    void this.markEntryOnboardingAutoShownIfVisible()
  }

  private observeEntryOnboardingTargets() {
    if (typeof MutationObserver === 'undefined' || !globalThis.document?.body) {
      return
    }

    this.#entryOnboardingObserver = new MutationObserver(() => this.scheduleEntryOnboardingRefresh())
    this.#entryOnboardingObserver.observe(globalThis.document.body, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-onboarding-target'],
      childList: true,
      subtree: true
    })

    this.#destroyRef.onDestroy(() => {
      this.#entryOnboardingObserver?.disconnect()
      this.#entryOnboardingObserver = null

      if (this.#entryOnboardingRefreshHandle !== null) {
        globalThis.window?.clearTimeout(this.#entryOnboardingRefreshHandle)
        this.#entryOnboardingRefreshHandle = null
      }
    })
  }

  private createEntryOnboardingSteps() {
    return createFeatureEntryOnboardingSteps((key) => this.#translateService.instant(key))
  }

  private reloadEntryOnboardingSteps() {
    this.entryOnboardingAllSteps.set(this.createEntryOnboardingSteps())
    this.refreshEntryOnboardingState()
  }

  private shouldTrackEntryOnboardingTargets() {
    return (
      this.entryOnboardingOpen() &&
      shouldShowFeatureEntryOnboardingForXpertCount(
        this.entryOnboardingXpertCount(),
        this.entryOnboardingManuallyRequested()
      )
    )
  }

  navigate(link: MenuCatalog) {
    switch (link) {
      case MenuCatalog.Project:
        this.#router.navigate(['/data/project'])
        break
      case MenuCatalog.Stories:
        this.#router.navigate(['/data/project'])
        break
      case MenuCatalog.Models:
        this.#router.navigate(['/data/models'])
        break
      case MenuCatalog.Settings:
        this.#router.navigate(['/settings'])
        break
    }
  }

  onBrandClick() {
    const activeComponent = this.mainOutlet()?.component as { newConversation?: () => void } | undefined
    if (this.#router.url.startsWith('/chat') && typeof activeComponent?.newConversation === 'function') {
      activeComponent.newConversation()
      return
    }

    this.#router.navigate(['/chat'])
  }

  // Shows and hides the loading spinner during RouterEvent changes
  navigationInterceptor(event: RouterEvent): void {
    if (event instanceof NavigationStart) {
      this.pendingRouteUrl.set(event.url)
      this.loading.set(true)
    }
    if (event instanceof NavigationEnd) {
      const url = event.urlAfterRedirects
      this.activeRouteUrl.set(url)
      this.pendingRouteUrl.set(null)
      this.loading.set(false)
      if (
        this.#store.featureContextHydrationFailed &&
        !this.#store.featureContextHydrationLoading &&
        this.#store.userId
      ) {
        this.#store.featureContextHydrationLoading = true
        this.#store.featureContextHydrationFailed = false
        void this.hydrateCurrentUserContextInBackground(this.#store.userId)
      }
      if (url.match(/^\/data\/project(?:\/|$)/)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Project,
          id: !url.match(/^\/data\/project\/?$/)
        })
      } else if (url.match(/^\/story(?:\/|$)/)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Stories
        })
      } else if (url.match(/^\/data\/models(?:\/|$)/)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Models,
          id: !url.match(/^\/data\/models\/?$/)
        })
      } else if (url.match(/^\/settings(?:\/|$)/)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Settings,
          id: !url.match(/^\/settings\/?$/)
        })
      } else if (url.match(/^\/indicator-app(?:\/|$)/)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.IndicatorApp
        })
      } else {
        this.#appService.setCatalog({ catalog: null })
      }
    }

    // Set loading state to false in both of the below events to hide the spinner in case a request fails
    if (event instanceof NavigationCancel) {
      this.pendingRouteUrl.set(null)
      this.loading.set(false)
    }
    if (event instanceof NavigationError) {
      this.pendingRouteUrl.set(null)
      this.loading.set(false)
    }
  }

  toggleDark() {
    this.#appService.toggleDark()
  }

  toEnableCopilot() {
    this.#router.navigate(['settings', 'copilot'])
  }
}

function sameEntryOnboardingSteps(left: unknown[], right: unknown[]) {
  return left.length === right.length && left.every((step, index) => step === right[index])
}
