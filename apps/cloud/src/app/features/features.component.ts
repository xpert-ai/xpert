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
import { UsersService } from '@metad/cloud/state'
import { isNotEmpty, nonNullable } from '@metad/core'
import { NgmCopilotChatComponent, NgmCopilotEngineService } from '@metad/copilot-angular'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { combineLatestWith, firstValueFrom } from 'rxjs'
import { filter, map, startWith, tap } from 'rxjs/operators'
import {
  AIPermissionsEnum,
  AbilityActions,
  AnalyticsFeatures,
  AnalyticsFeatures as AnalyticsFeatureEnum,
  AnalyticsPermissionsEnum,
  EmployeesService,
  FeatureEnum,
  AiFeatureEnum,
  IOrganization,
  IRolePermission,
  IUser,
  MenuCatalog,
  PermissionsEnum,
  RolesEnum,
  Store,
  routeAnimations
} from '../@core'
import { AppService } from '../app.service'
import { ModelCreationComponent } from './semantic-model/creation/creation.component'
import { QueryCreationDialogComponent } from './semantic-model/query-creation.component'
import { injectChatCommand } from '../@shared/copilot'
import { StoryCreationComponent } from '../@shared/story'


@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  animations: [routeAnimations]
})
export class FeaturesComponent implements OnInit {
  MENU_CATALOG = MenuCatalog
  eNgxFloatUiPlacements = NgxFloatUiPlacements
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  AbilityActions = AbilityActions

  readonly #destroyRef = inject(DestroyRef)

  readonly sidenav = viewChild('sidenav', { read: MatSidenav })
  readonly copilotChat = viewChild('copilotChat', { read: NgmCopilotChatComponent })

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
  readonly copilotEnabled$ = toSignal(this.appService.copilotEnabled$)
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
      if (this.store.fixedLayoutSider()) {
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
        this.menus.set(this.getMenuItems(org))
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
      const enabled = !this.store.hasFeatureEnabled(featureKey)
      item.hidden = enabled || (item.data.hide && item.data.hide())
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
      this.store.setFixedLayoutSider(true)
    } else {
      this.sidenav().toggle()
      setTimeout(() => {
        this.store.setFixedLayoutSider(false)
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

  onMenuClicked(event, isMobile) {
    // this.isCollapsed = true
    // if (isMobile) {
    //   this.isCollapsedHidden = true
    // }
  }

  toggleDark() {
    this.appService.toggleDark()
  }

  getMenuItems(org: IOrganization): PacMenuItem[] {
    return [
      // Xpert AI Features
      {
        title: 'Chat',
        matIcon: 'robot_2',
        link: '/chat',
        pathMatch: 'prefix',
        data: {
          translationKey: 'Chat',
          featureKey: AiFeatureEnum.FEATURE_COPILOT_CHAT,
          permissionKeys: [AIPermissionsEnum.CHAT_VIEW]
        }
      },
      {
        title: 'Explore Xperts',
        matIcon: 'explore',
        link: '/explore',
        pathMatch: 'prefix',
        data: {
          translationKey: 'Explore Xperts',
          featureKey: AiFeatureEnum.FEATURE_XPERT,
          permissionKeys: [AIPermissionsEnum.XPERT_EDIT]
        }
      },
      {
        title: 'Xpert',
        matIcon: 'engineering',
        link: '/xpert',
        pathMatch: 'prefix',
        data: {
          translationKey: 'Building Xperts',
          featureKey: AiFeatureEnum.FEATURE_XPERT,
          permissionKeys: [AIPermissionsEnum.XPERT_EDIT]
        }
      },

      // BI Features
      {
        title: 'Dashboard',
        matIcon: 'leaderboard',
        link: '/dashboard',
        pathMatch: 'prefix',
        // home: true,
        data: {
          translationKey: 'Dashboard',
          featureKey: FeatureEnum.FEATURE_DASHBOARD
        },
        children: [
          {
            title: 'Today',
            matIcon: 'today',
            link: '/dashboard',
            data: {
              translationKey: 'Today',
              featureKey: FeatureEnum.FEATURE_DASHBOARD
            }
          },
          {
            title: 'Catalog',
            matIcon: 'subscriptions',
            link: '/dashboard/catalog',
            data: {
              translationKey: 'Catalog',
              featureKey: FeatureEnum.FEATURE_DASHBOARD
            }
          },
          {
            title: 'Trending',
            matIcon: 'timeline',
            link: '/dashboard/trending',
            data: {
              translationKey: 'Trending',
              featureKey: FeatureEnum.FEATURE_DASHBOARD
            }
          },
        ]
      },
      {
        title: 'Chat BI',
        matIcon: 'mms',
        link: '/chatbi',
        pathMatch: 'prefix',
        data: {
          translationKey: 'ChatBI',
          featureKey: AnalyticsFeatures.FEATURE_COPILOT_CHATBI,
          permissionKeys: [AnalyticsPermissionsEnum.CHATBI_VIEW]
        }
      },
      // {
      //   title: 'Data Factory',
      //   matIcon: 'data_table',
      //   link: '/data',
      //   pathMatch: 'prefix',
      //   data: {
      //     translationKey: 'DataFactory',
      //     featureKey: AnalyticsFeatures.FEATURE_COPILOT_CHATBI,
      //     permissionKeys: [AnalyticsPermissionsEnum.DATA_FACTORY_VIEW]
      //   }
      // },
      {
        title: 'Semantic Model',
        matIcon: 'database',
        link: '/models',
        pathMatch: 'prefix',
        data: {
          translationKey: 'Semantic Model',
          featureKey: AnalyticsFeatures.FEATURE_MODEL,
          permissionKeys: [AnalyticsPermissionsEnum.MODELS_EDIT]
        }
      },
      {
        title: 'Project',
        matIcon: 'dashboard',
        link: '/project',
        pathMatch: 'prefix',
        data: {
          translationKey: 'Project',
          featureKey: AnalyticsFeatures.FEATURE_PROJECT,
          permissionKeys: [AnalyticsPermissionsEnum.STORIES_VIEW]
        },
        children: [
          {
            title: 'Story',
            matIcon: 'auto_stories',
            link: '/project',
            data: {
              translationKey: 'Story',
              featureKey: AnalyticsFeatures.FEATURE_STORY,
              permissionKeys: [AnalyticsPermissionsEnum.STORIES_VIEW]
            }
          },
          {
            title: 'Indicators',
            matIcon: 'trending_up',
            link: '/project/indicators',
            data: {
              translationKey: 'Indicators',
              featureKey: AnalyticsFeatures.FEATURE_INDICATOR,
              permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_EDIT]
            }
          }
        ]
      },
      {
        title: 'Indicator Market',
        matIcon: 'local_grocery_store',
        link: '/indicator/market',
        data: {
          translationKey: 'Indicator Market',
          featureKey: AnalyticsFeatureEnum.FEATURE_INDICATOR_MARKET,
          permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_MARTKET_VIEW]
        }
      },
      {
        title: 'Indicator App',
        matIcon: 'trending_up',
        pathMatch: 'prefix',
        link: '/indicator-app',
        data: {
          translationKey: 'Indicator App',
          featureKey: AnalyticsFeatureEnum.FEATURE_INDICATOR_APP,
          permissionKeys: [AnalyticsPermissionsEnum.INDICATOR_VIEW]
        }
      },
      {
        title: 'Data Sources',
        matIcon: 'settings_remote',
        link: '/settings/data-sources',
        admin: true,
        data: {
          translationKey: 'Data Sources',
          permissionKeys: [AnalyticsPermissionsEnum.DATA_SOURCE_EDIT],
          featureKey: AnalyticsFeatures.FEATURE_MODEL
        }
      },
      {
        title: 'Settings',
        matIcon: 'settings',
        link: '/settings',
        admin: true,
        data: {
          translationKey: 'Settings',
          featureKey: FeatureEnum.FEATURE_SETTING
        },
        children: [
          {
            title: 'Account',
            matIcon: 'account_circle',
            link: '/settings/account',
            data: {
              translationKey: 'Account'
            }
          },
          {
            title: 'AI Copilot',
            matIcon: 'assistant',
            link: '/settings/copilot',
            data: {
              translationKey: 'AI Copilot',
              permissionKeys: [AIPermissionsEnum.COPILOT_EDIT],
              featureKey: AiFeatureEnum.FEATURE_COPILOT
            }
          },
          {
            title: 'Knowledgebase',
            matIcon: 'school',
            link: '/settings/knowledgebase',
            data: {
              translationKey: 'Knowledgebase',
              permissionKeys: [AIPermissionsEnum.KNOWLEDGEBASE_EDIT],
              featureKey: AiFeatureEnum.FEATURE_COPILOT_KNOWLEDGEBASE
            }
          },
          {
            title: 'Chat BI',
            matIcon: 'try',
            link: '/settings/chatbi',
            data: {
              translationKey: 'Chat BI',
              permissionKeys: [AnalyticsPermissionsEnum.CHATBI_EDIT],
              featureKey: AnalyticsFeatures.FEATURE_COPILOT_CHATBI
            }
          },
          {
            title: 'User',
            matIcon: 'people',
            link: '/settings/users',
            data: {
              translationKey: 'User',
              permissionKeys: [PermissionsEnum.ORG_USERS_EDIT],
              featureKey: FeatureEnum.FEATURE_USER
            }
          },
          {
            title: 'Roles',
            matIcon: 'supervisor_account',
            link: '/settings/roles',
            data: {
              translationKey: 'Role & Permission',
              featureKey: FeatureEnum.FEATURE_ROLES_PERMISSION,
              permissionKeys: [PermissionsEnum.CHANGE_ROLES_PERMISSIONS]
            }
          },
          {
            title: 'Business Area',
            matIcon: 'workspaces',
            link: '/settings/business-area',
            pathMatch: 'prefix',
            data: {
              translationKey: 'Business Area',
              featureKey: AnalyticsFeatures.FEATURE_BUSINESS_AREA,
              permissionKeys: [AnalyticsPermissionsEnum.BUSINESS_AREA_EDIT]
            }
          },
          {
            title: 'Certification',
            matIcon: 'verified_user',
            link: '/settings/certification',
            pathMatch: 'prefix',
            data: {
              translationKey: 'Certification',
              // 同语义模型的功能绑定一起启用与否
              featureKey: AnalyticsFeatures.FEATURE_MODEL,
              permissionKeys: [AnalyticsPermissionsEnum.CERTIFICATION_EDIT]
            }
          },
          {
            title: 'Integration',
            matIcon: 'hub',
            link: '/settings/integration',
            pathMatch: 'prefix',
            data: {
              translationKey: 'Integration',
              featureKey: FeatureEnum.FEATURE_INTEGRATION,
              permissionKeys: [PermissionsEnum.INTEGRATION_EDIT]
            }
          },
          
          {
            title: 'Email Templates',
            matIcon: 'email',
            link: '/settings/email-templates',
            data: {
              translationKey: 'Email Template',
              permissionKeys: [PermissionsEnum.VIEW_ALL_EMAIL_TEMPLATES],
              featureKey: FeatureEnum.FEATURE_EMAIL_TEMPLATE
            }
          },
          {
            title: 'Custom SMTP',
            matIcon: 'alternate_email',
            link: '/settings/custom-smtp',
            data: {
              translationKey: 'Custom SMTP',
              permissionKeys: [PermissionsEnum.CUSTOM_SMTP_VIEW],
              featureKey: FeatureEnum.FEATURE_SMTP
            }
          },
          {
            title: 'Features',
            matIcon: 'widgets',
            link: '/settings/features',
            data: {
              translationKey: 'Feature',
              permissionKeys: [RolesEnum.SUPER_ADMIN]
            }
          },
          {
            title: 'Organizations',
            matIcon: 'corporate_fare',
            link: '/settings/organizations',
            data: {
              translationKey: 'Organization',
              permissionKeys: [RolesEnum.SUPER_ADMIN]
            }
          },
          ...(org ? [] : [
            {
              title: 'Tenant',
              matIcon: 'storage',
              link: '/settings/tenant',
              data: {
                translationKey: 'Tenant',
                permissionKeys: [RolesEnum.SUPER_ADMIN]
              }
            }
          ])
        ]
      }
    ]
  }

  async createQuery() {
    const query = await firstValueFrom(this.dialog.open(QueryCreationDialogComponent).afterClosed())
    if (query) {
      this.router.navigate(['models', query.modelId, 'query', query.key])
    }
  }

  async createStory() {
    const story = await firstValueFrom(
      this.dialog
        .open(StoryCreationComponent, {
          data: {}
        })
        .afterClosed()
    )

    if (story) {
      this.router.navigate(['story', story.id, 'edit'])
    }
  }

  async createModel() {
    const model = await firstValueFrom(this.dialog.open(ModelCreationComponent, { data: {} }).afterClosed())
    if (model) {
      this.router.navigate(['models', model.id])
    }
  }

  async createIndicator() {
    this.router.navigate(['project', 'indicators', 'new'])
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
