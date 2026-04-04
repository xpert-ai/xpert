import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ToastrService, UsersService } from '@metad/cloud/state'
import { IUser, RolesEnum } from '@metad/contracts'
import { NgmConfirmDeleteService, NgmSearchComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { getErrorMessage, RequestScopeLevel, RoleService, Store, UsersOrganizationsService } from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { includes } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, switchMap } from 'rxjs'
import { PACUsersComponent } from '../users.component'
import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { RouterModule } from '@angular/router'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import { distinctUntilChanged } from 'rxjs/operators'

@Component({
  standalone: true,
  selector: 'pac-manage-user',
  templateUrl: './manage-user.component.html',
  styleUrls: ['./manage-user.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    ...ZardSelectImports,
    // OCAP Modules
    OcapCoreModule,
    UserProfileInlineComponent,
    NgmSearchComponent
  ]
})
export class ManageUserComponent extends TranslationBaseComponent {
  private usersComponent = inject(PACUsersComponent)
  private readonly store = inject(Store)
  private userService = inject(UsersService)
  private readonly roleService = inject(RoleService)
  private readonly userOrganizationsService = inject(UsersOrganizationsService)
  private readonly _confirmDelete = inject(NgmConfirmDeleteService)
  private toastrService = inject(ToastrService)

  readonly defaultRoleBadgeClass = 'text-text-primary'
  readonly roleBadgeClassMap: Record<string, string> = {
    [RolesEnum.VIEWER]: 'text-text-secondary',
    [RolesEnum.ADMIN]: 'text-text-warning',
    [RolesEnum.SUPER_ADMIN]: 'text-text-destructive',
    [RolesEnum.AI_BUILDER]: 'text-text-accent',
    [RolesEnum.ANALYTICS_BUILDER]: 'text-text-success'
  }

  private search$ = new BehaviorSubject<string>('')
  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
  })
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  private readonly scopeLevel$ = this.store
    .selectActiveScope()
    .pipe(
      map((scope) => scope.level),
      distinctUntilChanged()
    )

  roles$ = new BehaviorSubject<string[]>([])
  readonly availableRoles$ = this.roleService.getAll().pipe(
    map(({ items }) => items.map(({ name }) => name)),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  get roles() {
    return this.roles$.value
  }
  set roles(value) {
    this.roles$.next(value)
  }

  get search() {
    return this.search$.value
  }
  set search(value) {
    this.search$.next(value)
  }

  onRolesSelectionChange(value: string | number | Array<string | number>) {
    this.roles = Array.isArray(value) ? value.map((item) => `${item}`) : []
  }

  private refresh$ = new BehaviorSubject<void>(null)
  public readonly users$ = combineLatest([this.refresh$, this.scopeLevel$, this.roles$, this.search$]).pipe(
    switchMap(([, scopeLevel, roles, search]) =>
      scopeLevel === RequestScopeLevel.TENANT
        ? this.userService.getAll(['role']).pipe(
            map((users) => this.filterUsers(users, search, roles, true))
          )
        : this.userOrganizationsService.getAllInOrg(['user', 'user.role']).pipe(
            map(({ items }) => this.mapMembershipsToUsers(items)),
            map((users) => this.filterUsers(users, search, roles, true))
          )
    )
  )

  private refreshSub = this.usersComponent.refresh$.subscribe(() => {
    this.refresh$.next()
  })

  openUser(user: IUser) {
    this.usersComponent.navUser(user)
  }

  /**
   * 对比下面函数的写法
   */
  async remove(user: IUser) {
    if (!this.isTenantScope()) {
      return
    }

    const confirm = await firstValueFrom(this._confirmDelete.confirm({ value: userLabel(user) }))
    if (confirm) {
      try {
        await firstValueFrom(this.userService.delete(user.id,))
        this.toastrService.success('PAC.NOTES.USERS.UserDelete', {
          name: userLabel(user)
        })
        this.refresh$.next()
      } catch (err) {
        this.toastrService.error(getErrorMessage(err))
      }
    }
  }

  private mapMembershipsToUsers(memberships: Array<{ user?: IUser | null }>) {
    const users = new Map<string, IUser>()

    for (const membership of memberships ?? []) {
      const user = membership?.user
      if (user?.id && !users.has(user.id)) {
        users.set(user.id, user)
      }
    }

    return [...users.values()].sort((left, right) => userLabel(left).localeCompare(userLabel(right)))
  }

  private filterUsers(users: IUser[], search: string, roles: string[], allowRoleFilter: boolean) {
    const searchText = search?.toLowerCase().trim()
    const filteredByRole =
      allowRoleFilter && roles?.length
        ? users.filter((user) => user.role?.name && includes(roles, user.role.name))
        : users

    if (!searchText) {
      return filteredByRole
    }

    return filteredByRole.filter(
      (user) =>
        user.name?.toLowerCase().includes(searchText) ||
        user.lastName?.toLowerCase().includes(searchText) ||
        user.firstName?.toLowerCase().includes(searchText) ||
        user.email?.toLowerCase().includes(searchText)
    )
  }
}
