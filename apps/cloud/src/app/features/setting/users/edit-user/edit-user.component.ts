import { Component, computed, effect, HostListener, inject, model, signal, viewChild } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgxPermissionsService } from 'ngx-permissions'

import { ActivatedRoute, Router } from '@angular/router'
import { UserChangePasswordFormComponent } from '@cloud/app/@shared/user/forms'
import { Store, UsersService } from '@cloud/app/@core/state'
import { AiFeatureEnum, IRole, IUser, PermissionsEnum, UserType } from '@xpert-ai/contracts'
import { injectConfirmDelete } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { BehaviorSubject, combineLatest, firstValueFrom, from, of } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import {
  AIPermissionsEnum,
  getErrorMessage,
  injectToastr,
  RequestScopeLevel,
  RolesEnum,
  RoleService
} from '../../../../@core'
import { XpUserOrganizationsComponent } from '../organizations/organizations.component'
import { UserBasicComponent } from '../user-basic/user-basic.component'
import {
  ZardAlertDialogService,
  ZardAvatarComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { UserMembershipComponent } from '../user-membership/user-membership.component'

type UserDetailTab = 'basic' | 'membership' | 'organizations' | 'security'

const USER_DETAIL_TABS: Array<{ id: UserDetailTab; regularOnly?: boolean }> = [
  { id: 'basic' },
  { id: 'membership', regularOnly: true },
  { id: 'organizations', regularOnly: true },
  { id: 'security', regularOnly: true }
]

@Component({
  standalone: true,
  selector: 'xp-edit-user',
  templateUrl: './edit-user.component.html',
  host: { class: 'relative block min-w-0' },
  imports: [
    FormsModule,
    TranslateModule,
    ZardAvatarComponent,
    ZardIconComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardTabsImports,
    UserBasicComponent,
    UserChangePasswordFormComponent,
    XpUserOrganizationsComponent,
    UserMembershipComponent
  ]
})
export class XpEditUserComponent {
  RolesEnum = RolesEnum
  readonly userLabel = userLabel

  readonly store = inject(Store)
  private userService = inject(UsersService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()

  readonly me = this.store.user
  private readonly alertDialog = inject(ZardAlertDialogService)
  private readonly permissionsService = inject(NgxPermissionsService)
  readonly permissions = toSignal(this.permissionsService.permissions$, {
    initialValue: this.permissionsService.getPermissions()
  })
  readonly basicInfo = viewChild(UserBasicComponent)
  private readonly refresh$ = new BehaviorSubject<void>(undefined)
  readonly roles = toSignal<IRole[], IRole[]>(
    inject(RoleService)
      .getAll()
      .pipe(
        map(({ items }) => items),
        catchError(() => of([]))
      ),
    { initialValue: [] }
  )
  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
  })
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly canManageTenantUser = computed(() => {
    this.permissions()
    return this.isTenantScope() && this.store.hasPermission(PermissionsEnum.ALL_ORG_EDIT)
  })

  public readonly userId$ = this.route.params.pipe(
    startWith(this.route.snapshot.params),
    map((params) => params?.id),
    filter((id) => !!id),
    distinctUntilChanged()
  )

  readonly userState = toSignal(
    combineLatest([this.userId$, this.refresh$, toObservable(this.activeScope)]).pipe(
      switchMap(([userId]) =>
        from(this.userService.getUserById(userId, ['role'])).pipe(
          map((user) => ({ user, loading: false, error: false })),
          catchError(() => of({ user: null, loading: false, error: true })),
          startWith({ user: null, loading: true, error: false })
        )
      )
    ),
    { initialValue: { user: null, loading: true, error: false } }
  )
  readonly user = computed(() => {
    const user = this.userState().user
    return user ? { ...user, role: user.role ?? this.roles().find(({ id }) => id === user.roleId) } : null
  })
  readonly roleLabel = computed(() => this.user()?.role?.name || (this.user()?.roleId ? '—' : null))
  readonly userInitials = computed(() =>
    userLabel(this.user() ?? {})
      .split(/\s+/)
      .map((word) => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  )

  reloadUser() {
    this.refresh$.next()
  }

  async canLeave() {
    if (!this.basicInfo()?.hasChanges()) return true
    return firstValueFrom(
      this.alertDialog.confirm({
        title: this.#translate.instant('XP.UserDetail.UnsavedTitle'),
        description: this.#translate.instant('XP.UserDetail.UnsavedDescription'),
        actionText: this.#translate.instant('XP.UserDetail.DiscardAndLeave'),
        cancelText: this.#translate.instant('XP.UserDetail.KeepEditing')
      })
    )
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent) {
    if (this.basicInfo()?.hasChanges()) {
      event.preventDefault()
      event.returnValue = ''
    }
  }

  readonly loading = signal(false)
  readonly membershipPlanEnabled = toSignal(this.store.selectHasFeatureEnabled(AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN), {
    initialValue: this.store.hasFeatureEnabled(AiFeatureEnum.FEATURE_MEMBERSHIP_PLAN)
  })

  readonly newPassword = model<{ password: string; confirmPassword: string }>()
  readonly activeTab = signal<UserDetailTab>('basic')
  readonly queryTab = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => this.normalizeTab(params.get('tab'))),
      distinctUntilChanged()
    ),
    {
      initialValue: this.normalizeTab(this.route.snapshot.queryParamMap.get('tab'))
    }
  )
  readonly availableTabs = computed(() =>
    USER_DETAIL_TABS.filter(
      (tab) =>
        (tab.id !== 'membership' || this.canShowMembershipTab()) &&
        (tab.id !== 'organizations' || this.isTenantScope()) &&
        (tab.id !== 'security' || this.canManageTenantUser()) &&
        (!tab.regularOnly || !this.isTechnicalUser(this.user()))
    )
  )
  readonly activeTabIndex = computed(() => {
    const index = this.availableTabs().findIndex((tab) => tab.id === this.activeTab())
    return index > -1 ? index : 0
  })

  constructor() {
    effect(
      () => {
        const requestedTab = this.queryTab()
        const currentUser = this.user()
        const nextTab = this.isTabAvailable(requestedTab, currentUser) ? requestedTab : 'basic'

        if (this.activeTab() !== nextTab) {
          this.activeTab.set(nextTab)
        }

        if (requestedTab !== nextTab) {
          queueMicrotask(() => this.syncTabQuery(nextTab, true))
        }
      },
      { allowSignalWrites: true }
    )
  }

  isTechnicalUser(user?: IUser | null) {
    return user?.type === UserType.COMMUNICATION
  }

  readonly canShowMembershipTab = computed(() => {
    this.activeScope()
    this.permissions()
    return this.membershipPlanEnabled() && this.store.hasPermission(AIPermissionsEnum.MEMBERSHIP_EDIT as never)
  })

  userTypeLabelKey(type?: UserType) {
    return type === UserType.COMMUNICATION ? 'XP.Users.UserTypes.Technical' : 'XP.Users.UserTypes.Regular'
  }

  userTypeDefaultLabel(type?: UserType) {
    return type === UserType.COMMUNICATION ? 'Technical user' : 'Regular user'
  }

  userStatusLabelKey(user?: IUser | null) {
    return user?.deletedAt ? 'XP.KEY_WORDS.Disabled' : 'XP.KEY_WORDS.Active'
  }

  userStatusDefaultLabel(user?: IUser | null) {
    return user?.deletedAt ? 'Disabled' : 'Active'
  }

  selectTabByIndex(index: number) {
    const tab = this.availableTabs()[index]?.id ?? 'basic'
    this.syncTabQuery(tab)
  }

  private syncTabQuery(tab: UserDetailTab, replaceUrl = false) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl
    })
  }

  private normalizeTab(value?: string | null): UserDetailTab {
    return USER_DETAIL_TABS.some((tab) => tab.id === value) ? (value as UserDetailTab) : 'basic'
  }

  private isTabAvailable(tab: UserDetailTab, user?: IUser | null) {
    if (tab === 'membership' && !this.canShowMembershipTab()) {
      return false
    }
    if (tab === 'organizations' && !this.isTenantScope()) {
      return false
    }
    if (tab === 'security' && !this.canManageTenantUser()) {
      return false
    }
    if (!user) {
      return true
    }

    return !this.isTechnicalUser(user) || !USER_DETAIL_TABS.find((item) => item.id === tab)?.regularOnly
  }

  backToList() {
    this.router.navigate(['/settings/users'])
  }

  navigate(url) {
    this.router.navigate([url], { relativeTo: this.route })
  }

  deleteUser() {
    if (!this.canManageTenantUser() || this.isTechnicalUser(this.user()) || !this.user() || this.loading()) {
      return
    }

    this.confirmDelete(
      {
        value: userLabel(this.user()),
        information: this.#translate.instant('XP.USERS_PAGE.DeleteUserDesc', {
          Default: 'Delete this user and its associated data'
        })
      },
      of(true).pipe(
        switchMap(() => {
          this.loading.set(true)
          return this.userService.delete(this.user().id)
        })
      )
    ).subscribe({
      next: () => {
        this.loading.set(false)
        this.basicInfo()?.form.markAsPristine()
        this.toastr.success('XP.USERS_PAGE.UserDeletedSuccessfully', { Default: 'User deleted successfully' })
        this.router.navigate(['..'], { relativeTo: this.route })
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
  }

  async changePassword() {
    if (!this.canManageTenantUser() || this.isTechnicalUser(this.user()) || !this.user() || this.loading()) {
      return
    }

    if (
      this.newPassword()?.password?.length >= 8 &&
      this.newPassword().confirmPassword === this.newPassword().password
    ) {
      this.loading.set(true)
      try {
        await this.userService.update(this.user().id, { hash: this.newPassword().password })
        this.loading.set(false)
        this.toastr.success('XP.USERS_PAGE.PasswordChangedSuccessfully', {
          Default: 'Password changed successfully'
        })
        this.newPassword.set({ password: '', confirmPassword: '' })
      } catch (err) {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    }
  }
}
