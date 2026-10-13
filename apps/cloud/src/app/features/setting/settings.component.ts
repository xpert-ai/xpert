import { A11yModule } from '@angular/cdk/a11y'
import { BreakpointObserver } from '@angular/cdk/layout'
import { NgTemplateOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  effect,
  inject,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { TranslateModule } from '@ngx-translate/core'
import {
  LayoutComponent,
  SidebarComponent,
  SidebarGroupComponent,
  SidebarGroupLabelComponent,
  ZardBreadcrumbComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardSheetRef,
  ZardSheetService,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'
import { AiFeatureEnum, AIPermissionsEnum, Store, UserType, injectTheme } from '../../@core'
import { HeaderUserComponent, OrganizationSelectorComponent } from '../../@theme/header'
import { getSettingsMenuItems } from '../menus'
import { buildSettingsNavigation, findSettingsNavigationItem } from './settings-navigation'

@Component({
  standalone: true,
  imports: [
    RouterModule,
    NgTemplateOutlet,
    A11yModule,
    TranslateModule,
    LayoutComponent,
    SidebarComponent,
    SidebarGroupComponent,
    SidebarGroupLabelComponent,
    ZardBreadcrumbComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardTooltipImports,
    HeaderUserComponent,
    OrganizationSelectorComponent
  ],
  selector: 'xp-settings',
  templateUrl: 'settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpSettingComponent {
  private readonly rolesService = inject(NgxRolesService)
  private readonly permissionsService = inject(NgxPermissionsService)
  private readonly store = inject(Store)
  private readonly router = inject(Router)
  private readonly breakpoints = inject(BreakpointObserver)
  private readonly sheet = inject(ZardSheetService)
  private readonly destroyRef = inject(DestroyRef)
  readonly i18nService = injectI18nService()
  readonly theme = injectTheme()
  readonly search = signal('')
  readonly mobileMenuOpen = signal(false)
  private mobileSheet: ZardSheetRef<unknown> | null = null

  readonly compact = toSignal(this.breakpoints.observe('(max-width: 767px)').pipe(map((state) => state.matches)), {
    initialValue: this.breakpoints.isMatched('(max-width: 767px)')
  })
  readonly user = toSignal(this.store.user$, { initialValue: this.store.user })
  readonly activeScope = toSignal(this.store.selectActiveScope(), { initialValue: this.store.activeScope })
  readonly permissions = toSignal(this.permissionsService.permissions$.pipe(distinctUntilChanged()))
  readonly rolePermissions = toSignal(this.store.userRolePermissions$)
  readonly featureContextHydrated = toSignal(this.store.featureContextHydrated$, {
    initialValue: this.store.featureContextHydrated
  })
  readonly language = toSignal(this.i18nService.stream('XP.SettingsShell'))
  readonly currentPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
      map((url) => url.split(/[?#]/)[0].replace(/^\/settings\/?/, ''))
    ),
    { requireSync: true }
  )

  readonly menus = computed(() => {
    const scopeLevel = this.activeScope().level
    this.permissions()
    const featureContextHydrated = this.featureContextHydrated()

    return getSettingsMenuItems(scopeLevel).filter((item) => {
      if (item.data?.featureKey && featureContextHydrated) {
        const featureKey = Array.isArray(item.data.featureKey) ? item.data.featureKey : [item.data.featureKey]
        if (!featureKey.every((key) => this.store.hasFeatureEnabled(key))) return false
      }
      if (item.data?.permissionKeys) {
        return item.data.permissionKeys.some(
          (key) => !!this.rolesService.getRole(key) || !!this.permissionsService.getPermission(key)
        )
      }
      return true
    })
  })

  readonly groups = computed(() => {
    this.rolePermissions()
    this.featureContextHydrated()
    const regularUser = this.user()?.type !== UserType.COMMUNICATION
    return buildSettingsNavigation(this.menus(), {
      membership: this.store.hasPermission(AIPermissionsEnum.MEMBERSHIP_USE),
      models: regularUser,
      gateway:
        regularUser &&
        this.store.hasFeatureEnabled(AiFeatureEnum.FEATURE_MODEL_GATEWAY) &&
        this.store.hasPermission(AIPermissionsEnum.MODEL_GATEWAY_USE)
    })
  })
  readonly activeItem = computed(() => findSettingsNavigationItem(this.groups(), this.currentPath()))
  readonly activeGroup = computed(() =>
    this.groups().find((group) => group.items.some((item) => item === this.activeItem()))
  )
  readonly filteredGroups = computed(() => {
    this.language()
    const search = this.search().trim().toLocaleLowerCase()
    return this.groups()
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            !search ||
            this.i18nService.instant(item.translationKey, { Default: item.label }).toLocaleLowerCase().includes(search)
        )
      }))
      .filter((group) => group.items.length)
  })

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => {
        this.search.set('')
        this.closeNavigation()
      })
    effect(() => {
      if (!this.compact()) this.closeNavigation()
    })
    this.destroyRef.onDestroy(() => this.closeNavigation())
  }

  openNavigation(content: TemplateRef<unknown>) {
    if (this.mobileSheet) return
    const ref = this.sheet.create({
      zContent: content,
      zSide: 'left',
      zWidth: 'min(20rem, 90vw)',
      zCustomClasses: '[&>main]:space-y-0',
      zHideFooter: true,
      zClosable: false
    })
    this.mobileSheet = ref
    this.mobileMenuOpen.set(true)
    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.mobileSheet = null
        this.mobileMenuOpen.set(false)
      })
  }

  closeNavigation() {
    this.mobileSheet?.close()
  }

  toggleTheme() {
    this.store.preferredTheme = this.theme().primary === 'dark' ? 'light' : 'dark'
  }
}
