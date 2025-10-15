import { Location } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
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
import { MatDialog } from '@angular/material/dialog'
import { MatDrawerMode, MatSidenav, MatSidenavContainer } from '@angular/material/sidenav'
import {
  Event,
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterEvent
} from '@angular/router'
import { PacMenuItem } from '@metad/cloud/auth'
import { injectUserPreferences, UsersService } from '@metad/cloud/state'
import { isNotEmpty, nonNullable } from '@metad/core'
import { NgmCopilotChatComponent, NgmCopilotEngineService } from '@metad/copilot-angular'
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
import { injectChatCommand } from '../@shared/copilot'
import { attrModel } from '@metad/ocap-angular/core'
import { getFeatureMenus } from './menus'


@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  animations: [routeAnimations]
})
export class FeaturesComponent implements OnInit {
  MENU_CATALOG = MenuCatalog
  AbilityActions = AbilityActions

  readonly #destroyRef = inject(DestroyRef)
  readonly #preferences = injectUserPreferences()

  readonly sidenav = viewChild('sidenav', { read: MatSidenav })
  readonly copilotChat = viewChild('copilotChat', { read: NgmCopilotChatComponent })

  // States
  readonly fixedLayoutSider = attrModel(this.#preferences, 'fixedLayoutSider')

  copilotEngine: NgmCopilotEngineService | null = null
  readonly sidenavMode = signal<MatDrawerMode>('over')
  readonly sidenavOpened = model(false)
  isEmployee: boolean
  organization: IOrganization
  user: IUser

  readonly isMobile = this.appService.isMobile
  get isAuthenticated() {
    return !!this.store.user
  }
  assetsSearch = ''
  readonly fullscreenIndex$ = toSignal(this.appService.fullscreenIndex$)
  public readonly isAuthenticated$ = this.store.user$
  public readonly navigation$ = this.appService.navigation$.pipe(
    filter(nonNullable),
    combineLatestWith(this.translateService.stream('PAC.KEY_WORDS')),
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

  get isCollapsed() {
    return this.sidenavOpened() && this.sidenavMode() === 'side'
  }

  assetsInit = false
  readonly copilotDrawerOpened = model(false)
  readonly loading = signal(false)

  readonly title = this.appService.title
  /**
   * @deprecated use Xpert Agent instead
   */
  readonly copilotEnabled$ = signal(false) // toSignal(this.appService.copilotEnabled$)
  readonly user$ = toSignal(this.store.user$)

  readonly selectedOrganization$ = this.store.selectedOrganization$

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly menus = signal<PacMenuItem[]>([])
  /**
  |--------------------------------------------------------------------------
  | Copilots
  |--------------------------------------------------------------------------
  */
  readonly chatCommand = injectChatCommand()

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effects)
  |--------------------------------------------------------------------------
  */
  private _userSub = this.store.user$
    .pipe(
      filter((user: IUser) => !!user),
      takeUntilDestroyed()
    )
    .subscribe((value) => {
      this.checkForEmployee()
      this.logger?.debug(value)
    })

  constructor(
    public readonly appService: AppService,
    private readonly employeeService: EmployeesService,
    private readonly store: Store,
    private readonly rolesService: NgxRolesService,
    private readonly ngxPermissionsService: NgxPermissionsService,
    private readonly usersService: UsersService,
    public readonly translateService: TranslateService,
    protected renderer: Renderer2,
    private router: Router,
    public dialog: MatDialog,
    private location: Location,
    private logger: NGXLogger
  ) {
    this.router.events
      .pipe(filter((e: Event | RouterEvent): e is RouterEvent => e instanceof RouterEvent))
      .subscribe((e: RouterEvent) => {
        this.navigationInterceptor(e)
        if (e instanceof NavigationEnd && this.sidenavMode() === 'over') {
          this.sidenav().close()
        }
      })

    effect(() => {
      if (this.fixedLayoutSider()) {
        this.sidenavMode.set('side')
        this.sidenavOpened.set(true)
      } else {
        this.sidenavMode.set('over')
        this.sidenavOpened.set(false)
      }
    }, { allowSignalWrites: true })
  }

  async ngOnInit() {
    await this._createEntryPoint()

    this.store.userRolePermissions$
      .pipe(
        filter((permissions: IRolePermission[]) => isNotEmpty(permissions)),
        map((permissions) => permissions.map(({ permission }) => permission)),
        tap((permissions) => this.ngxPermissionsService.loadPermissions(permissions)),
        combineLatestWith(this.translateService.onLangChange.pipe(startWith(null)), this.selectedOrganization$),
        takeUntilDestroyed(this.#destroyRef)
      )
      .subscribe(([permissions, lang, org]) => {
        this.menus.set(getFeatureMenus(org))
        this.loadItems()
      })
  }

  /*
   * This is app entry point after login
   */
  private async _createEntryPoint() {
    const id = this.store.userId
    if (!id) return

    this.user = await this.usersService.getMe([
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
      this.router.navigate(['/onboarding/tenant'])
      return
    }

    this.store.user = this.user

    //tenant enabled/disabled features for relatives organizations
    const { tenant, role } = this.user
    this.store.featureTenant = tenant.featureOrganizations.filter((item) => !item.organizationId)

    //only enabled permissions assign to logged in user
    this.store.userRolePermissions = role.rolePermissions.filter((permission) => permission.enabled)
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
    item.title = this.translateService.instant('PAC.MENU.' + item.data.translationKey, {
      Default: item.data.translationKey
    })
    if (item.data.permissionKeys || item.data.hide) {
      const anyPermission = item.data.permissionKeys
        ? item.data.permissionKeys.reduce((permission, key) => {
            return this.rolesService.getRole(key) || this.store.hasPermission(key) || permission
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
      const disabled = Array.isArray(featureKey) ? !featureKey.every((key) => this.store.hasFeatureEnabled(key)) : !this.store.hasFeatureEnabled(featureKey)
      item.hidden = disabled || (item.data.hide && item.data.hide())
    }

    if (item.children) {
      item.children.forEach((childItem) => {
        this.refreshMenuItem(childItem)
      })
    }
  }

  checkForEmployee() {
    const { tenantId, id: userId } = this.store.user
    this.employeeService.getEmployeeByUserId(userId, [], { tenantId }).then(({ success }) => {
      this.isEmployee = success
    })
  }

  toggleSidenav(sidenav: MatSidenavContainer) {
    if (this.sidenavMode() === 'over') {
      this.sidenavMode.set('side')
      setTimeout(() => {
        sidenav.ngDoCheck()
      }, 200)
      this.fixedLayoutSider.set(true)
    } else {
      this.sidenav().toggle()
      setTimeout(() => {
        this.fixedLayoutSider.set(false)
      }, 1000)
    }
  }

  navigate(link: MenuCatalog) {
    switch (link) {
      case MenuCatalog.Stories:
        this.router.navigate(['/project'])
        break
      case MenuCatalog.Models:
        this.router.navigate(['/models'])
        break
      case MenuCatalog.Settings:
        this.router.navigate(['/settings'])
        break
    }
  }

  // Shows and hides the loading spinner during RouterEvent changes
  navigationInterceptor(event: RouterEvent): void {
    if (event instanceof NavigationStart) {
      this.loading.set(true)
    }
    if (event instanceof NavigationEnd) {
      this.loading.set(false)
      if (event.url.match(/^\/project/g)) {
        this.appService.setCatalog({
          catalog: MenuCatalog.Project
        })
      } else if (event.url.match(/^\/project/g)) {
        this.appService.setCatalog({
          catalog: MenuCatalog.Stories
        })
      } else if (event.url.match(/^\/story/g)) {
      } else if (event.url.match(/^\/models/g)) {
        // this.appService.setCatalog({
        //   catalog: MenuCatalog.Models,
        //   id: !event.url.match(/^\/models$/g)
        // })
      } else if (event.url.match(/^\/settings/g)) {
        this.appService.setCatalog({
          catalog: MenuCatalog.Settings,
          id: !event.url.match(/^\/settings$/g)
        })
      } else if (event.url.match(/^\/indicator-app/g)) {
        this.appService.setCatalog({
          catalog: MenuCatalog.IndicatorApp
        })
      } else {
        this.appService.setCatalog({ catalog: null })
      }
    }

    // Set loading state to false in both of the below events to hide the spinner in case a request fails
    if (event instanceof NavigationCancel) {
      this.loading.set(false)
    }
    if (event instanceof NavigationError) {
      this.loading.set(false)
    }
  }

  back(): void {
    this.location.back()
  }

  toggleDark() {
    this.appService.toggleDark()
  }

  toEnableCopilot() {
    this.router.navigate(['settings', 'copilot'])
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey) {
      if (event.shiftKey) {

      } else {
        switch (event.key) {
          case 'b':
          case 'B':
            this.copilotDrawerOpened.update((value) => !value)
            event.preventDefault()
            break
          case '/':
            this.copilotDrawerOpened.set(true)
            event.preventDefault()
            setTimeout(() => {
              this.copilotChat().focus('/')
            }, 500)
            break
        }
      }
    }
  }
}
