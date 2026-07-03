import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'

import { ActivatedRoute, Router } from '@angular/router'
import { UserChangePasswordFormComponent } from '@cloud/app/@shared/user/forms'
import { Store, UsersService } from '@xpert-ai/cloud/state'
import { IUser, UserType } from '@xpert-ai/contracts'
import { injectConfirmDelete, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { of } from 'rxjs'
import { distinctUntilChanged, filter, map, startWith, switchMap } from 'rxjs/operators'
import { getErrorMessage, injectToastr, RolesEnum, routeAnimations } from '../../../../@core'
import { PACUserOrganizationsComponent } from '../organizations/organizations.component'
import { UserBasicComponent } from '../user-basic/user-basic.component'
import { ZardBadgeComponent, ZardButtonComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { UserMembershipComponent } from '../user-membership/user-membership.component'

type UserDetailTab = 'basic' | 'membership' | 'organizations' | 'security'

const USER_DETAIL_TABS: Array<{ id: UserDetailTab; regularOnly?: boolean }> = [
  { id: 'basic' },
  { id: 'membership' },
  { id: 'organizations', regularOnly: true },
  { id: 'security', regularOnly: true }
]

@Component({
  standalone: true,
  selector: 'pac-edit-user',
  templateUrl: './edit-user.component.html',
  styleUrls: ['./edit-user.component.scss'],
  animations: [routeAnimations],
  imports: [
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardTabsImports,
    NgmSpinComponent,
    UserBasicComponent,
    UserChangePasswordFormComponent,
    PACUserOrganizationsComponent,
    UserMembershipComponent
  ]
})
export class PACEditUserComponent {
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

  public readonly userId$ = this.route.params.pipe(
    startWith(this.route.snapshot.params),
    map((params) => params?.id),
    filter((id) => !!id),
    distinctUntilChanged()
  )

  public readonly user = toSignal(this.userId$.pipe(switchMap((userId) => this.userService.getUserById(userId))))

  readonly loading = signal(false)

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
    USER_DETAIL_TABS.filter((tab) => !tab.regularOnly || !this.isTechnicalUser(this.user()))
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

  userTypeLabelKey(type?: UserType) {
    return type === UserType.COMMUNICATION ? 'PAC.Users.UserTypes.Technical' : 'PAC.Users.UserTypes.Regular'
  }

  userTypeDefaultLabel(type?: UserType) {
    return type === UserType.COMMUNICATION ? 'Technical user' : 'Regular user'
  }

  userStatusLabelKey(user?: IUser | null) {
    return user?.deletedAt ? 'PAC.KEY_WORDS.Disabled' : 'PAC.KEY_WORDS.Active'
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
    this.confirmDelete(
      {
        value: userLabel(this.user()),
        information: this.#translate.instant('PAC.USERS_PAGE.DeleteUserDesc', {
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
        this.toastr.success('PAC.USERS_PAGE.UserDeletedSuccessfully', { Default: 'User deleted successfully' })
        this.router.navigate(['..'], { relativeTo: this.route })
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
  }

  async changePassword() {
    if (this.newPassword().password && this.newPassword().confirmPassword === this.newPassword().password) {
      this.loading.set(true)
      try {
        await this.userService.update(this.user().id, { hash: this.newPassword().password })
        this.loading.set(false)
        this.toastr.success('PAC.USERS_PAGE.PasswordChangedSuccessfully', {
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
