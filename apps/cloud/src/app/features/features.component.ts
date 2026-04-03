import { Location } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  OnInit,
  Renderer2,
  effect,
  inject,
  model,
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
import { PacMenuItem } from '@metad/cloud/auth'
import { injectUserPreferences, UsersService } from '@metad/cloud/state'
import { isNotEmpty, nonNullable } from '@metad/core'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { combineLatestWith } from 'rxjs'
import { filter, map, startWith, tap } from 'rxjs/operators'
import {
  AbilityActions,
  EmployeesService,
  IOrganization,
  IRolePermission,
  IUser,
  MenuCatalog,
  Store,
  routeAnimations
} from '../@core'
import { AppService } from '../app.service'
import { getFeatureMenus } from './menus'

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
  readonly #translateService = inject(TranslateService)
  readonly #renderer = inject(Renderer2)
  readonly #router = inject(Router)
  readonly #logger = inject(NGXLogger)
  readonly #appService = inject(AppService)
  readonly #employeeService = inject(EmployeesService)
  readonly #store = inject(Store)
  readonly appService = this.#appService

  // States
  readonly sidebarCollapsed = signal(true);
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
  readonly menus = signal<PacMenuItem[]>([])

  constructor() {
    this.#router.events
      .pipe(filter((e: Event | RouterEvent): e is RouterEvent => e instanceof RouterEvent))
      .subscribe((e: RouterEvent) => {
        this.navigationInterceptor(e)
      })
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
          this.#store.selectActiveScope()
        ),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe(([permissions, lang, org, scope]) => {
        this.organization = org
        this.menus.set(getFeatureMenus(scope.level, org))
        this.loadItems()
      })
  }

  /*
   * This is app entry point after login
   */
  private async _createEntryPoint() {
    const id = this.#store.userId
    if (!id) return

    this.user = await this.#usersService.getMe([
      'employee',
      'role',
      'role.rolePermissions',
      'tenant',
      'tenant.featureOrganizations',
      'tenant.featureOrganizations.feature'
    ])

    //When a new user registers & logs in for the first time, he/she does not have tenantId.
    //In this case, we have to redirect the user to the onboarding page to create their first organization, tenant, role.
    if (!this.user.tenantId) {
      this.#router.navigate(['/onboarding/tenant'])
      return
    }

    this.#store.user = this.user

    //tenant enabled/disabled features for relatives organizations
    const { tenant, role } = this.user
    this.#store.featureTenant = tenant.featureOrganizations.filter((item) => !item.organizationId)

    //only enabled permissions assign to logged in user
    this.#store.userRolePermissions = role.rolePermissions.filter((permission) => permission.enabled)
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

  refreshMenuItem(item: PacMenuItem) {
    item.title = this.#translateService.instant('PAC.MENU.' + item.data.translationKey, {
      Default: item.data.translationKey
    })
    if (item.data.permissionKeys || item.data.hide) {
      const anyPermission = item.data.permissionKeys
        ? item.data.permissionKeys.reduce((permission, key) => {
            return this.#rolesService.getRole(key) || this.#store.hasPermission(key) || permission
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
    if (item.data.hasOwnProperty('featureKey') && item.hidden !== true) {
      const { featureKey } = item.data
      const disabled = Array.isArray(featureKey) ? !featureKey.every((key) => this.#store.hasFeatureEnabled(key)) : !this.#store.hasFeatureEnabled(featureKey)
      item.hidden = disabled || (item.data.hide && item.data.hide())
    }

    if (item.children) {
      item.children.forEach((childItem) => {
        this.refreshMenuItem(childItem)
      })
    }
  }

  checkForEmployee() {
    const { tenantId, id: userId } = this.#store.user
    this.#employeeService.getEmployeeByUserId(userId, [], { tenantId }).then(({ success }) => {
      this.isEmployee = success
    })
  }

  toggleSidebar() {
    this.sidebarCollapsed.update(collapsed => !collapsed);
  }
 
  onCollapsedChange(collapsed: boolean) {
    this.sidebarCollapsed.set(collapsed);
  }

  navigate(link: MenuCatalog) {
    switch (link) {
      case MenuCatalog.Stories:
        this.#router.navigate(['/project'])
        break
      case MenuCatalog.Models:
        this.#router.navigate(['/models'])
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
      this.activeRouteUrl.set(event.urlAfterRedirects)
      this.pendingRouteUrl.set(null)
      this.loading.set(false)
      if (event.url.match(/^\/project/g)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Project
        })
      } else if (event.url.match(/^\/story/g)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Stories
        })
      } else if (event.url.match(/^\/models/g)) {
        // this.#appService.setCatalog({
        //   catalog: MenuCatalog.Models,
        //   id: !event.url.match(/^\/models$/g)
        // })
      } else if (event.url.match(/^\/settings/g)) {
        this.#appService.setCatalog({
          catalog: MenuCatalog.Settings,
          id: !event.url.match(/^\/settings$/g)
        })
      } else if (event.url.match(/^\/indicator-app/g)) {
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
