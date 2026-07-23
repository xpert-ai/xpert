import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ToastrService, UsersService } from '@xpert-ai/cloud/state'
import {
  type IOrganization,
  type IUser,
  type IUserOrganization,
  PermissionsEnum,
  RolesEnum,
  UserType
} from '@xpert-ai/contracts'
import { NgmConfirmDeleteService } from '@xpert-ai/ocap-angular/common'
import {
  DateRelativePipe,
  getErrorMessage,
  OrganizationsService,
  RequestScopeLevel,
  RoleService,
  Store,
  UsersOrganizationsService
} from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { includes } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom, map, shareReplay, switchMap } from 'rxjs'
import { PACUsersComponent } from '../users.component'
import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { RouterModule } from '@angular/router'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { distinctUntilChanged } from 'rxjs/operators'

type UserStatusFilter = 'all' | 'active' | 'disabled'
type UserTableRow = IUser & {
  displayOrganizations: IOrganization[]
}

const MANAGED_USER_TYPES = [UserType.USER, UserType.COMMUNICATION]
const DEFAULT_USER_TYPES = [UserType.USER]

const USER_TYPE_OPTIONS: Array<{ value: UserType; labelKey: string; defaultLabel: string }> = [
  {
    value: UserType.USER,
    labelKey: 'PAC.Users.UserTypes.Regular',
    defaultLabel: 'Regular user'
  },
  {
    value: UserType.COMMUNICATION,
    labelKey: 'PAC.Users.UserTypes.Technical',
    defaultLabel: 'Technical user'
  }
]

const USER_STATUS_OPTIONS: Array<{ value: UserStatusFilter; labelKey: string; defaultLabel: string }> = [
  {
    value: 'all',
    labelKey: 'PAC.KEY_WORDS.All',
    defaultLabel: 'All'
  },
  {
    value: 'active',
    labelKey: 'PAC.KEY_WORDS.Active',
    defaultLabel: 'Active'
  },
  {
    value: 'disabled',
    labelKey: 'PAC.KEY_WORDS.Disabled',
    defaultLabel: 'Disabled'
  }
]

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
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    ...ZardTableImports,
    DateRelativePipe
  ]
})
export class ManageUserComponent extends TranslationBaseComponent {
  private usersComponent = inject(PACUsersComponent)
  private readonly store = inject(Store)
  private userService = inject(UsersService)
  private readonly roleService = inject(RoleService)
  private readonly organizationsService = inject(OrganizationsService)
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
  readonly userTypeQuickFilters: Array<{ value: UserType | null; labelKey: string; defaultLabel: string }> = [
    {
      value: null,
      labelKey: 'PAC.KEY_WORDS.All',
      defaultLabel: 'All'
    },
    ...USER_TYPE_OPTIONS
  ]
  private userTypes$ = new BehaviorSubject<UserType[]>(DEFAULT_USER_TYPES)
  readonly allStatusFilter: UserStatusFilter = 'all'
  readonly statusOptions = USER_STATUS_OPTIONS
  private status$ = new BehaviorSubject<UserStatusFilter>(this.allStatusFilter)
  private organizationIds$ = new BehaviorSubject<string[]>([])
  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
  })
  readonly isTenantScope = computed(() => this.activeScope().level === RequestScopeLevel.TENANT)
  readonly canOpenUsers = this.usersComponent.canOpenUsers
  readonly canEditUsers = this.usersComponent.canEditUsers
  private readonly scopeLevel$ = this.store.selectActiveScope().pipe(
    map((scope) => scope.level),
    distinctUntilChanged()
  )

  roles$ = new BehaviorSubject<string[]>([])
  readonly availableRoles$ = this.roleService.getAll().pipe(
    map(({ items }) => items.map(({ name }) => name)),
    shareReplay({ bufferSize: 1, refCount: true })
  )
  readonly availableOrganizations$ = this.scopeLevel$.pipe(
    switchMap((scopeLevel) =>
      scopeLevel === RequestScopeLevel.TENANT && this.canViewAllOrganizations()
        ? this.organizationsService.getAll().pipe(map(({ items }) => this.sortOrganizations(items)))
        : this.userOrganizationsService
            .getAllInOrg(['organization'])
            .pipe(map(({ items }) => this.organizationsFromMemberships(items)))
    ),
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

  get userTypes() {
    return this.userTypes$.value
  }
  set userTypes(value) {
    this.userTypes$.next(value)
  }

  get status() {
    return this.status$.value
  }
  set status(value) {
    this.status$.next(value)
  }

  get organizationIds() {
    return this.organizationIds$.value
  }
  set organizationIds(value) {
    this.organizationIds$.next(value)
  }

  onRolesSelectionChange(value: string | number | Array<string | number>) {
    this.roles = Array.isArray(value) ? value.map((item) => `${item}`) : []
  }

  selectUserTypeQuickFilter(value: UserType | null) {
    this.userTypes = value ? [value] : []
  }

  isUserTypeQuickFilterActive(value: UserType | null) {
    return value ? this.userTypes.length === 1 && this.userTypes[0] === value : !this.userTypes.length
  }

  isDefaultUserTypeFilter() {
    return (
      this.userTypes.length === DEFAULT_USER_TYPES.length &&
      DEFAULT_USER_TYPES.every((type, index) => this.userTypes[index] === type)
    )
  }

  onStatusSelectionChange(value: string | number | Array<string | number>) {
    this.status = this.normalizeStatusFilter(value)
  }

  onOrganizationSelectionChange(value: string | number | Array<string | number>) {
    this.organizationIds = Array.isArray(value) ? value.map((item) => `${item}`) : value ? [`${value}`] : []
  }

  clearFilters() {
    this.roles = []
    this.userTypes = DEFAULT_USER_TYPES
    this.status = this.allStatusFilter
    this.organizationIds = []
  }

  private refresh$ = new BehaviorSubject<void>(null)
  public readonly users$ = combineLatest([
    this.refresh$,
    this.scopeLevel$,
    this.roles$,
    this.userTypes$,
    this.search$,
    this.status$,
    this.organizationIds$
  ]).pipe(
    switchMap(([, scopeLevel, roles, userTypes, search, status, organizationIds]) =>
      scopeLevel === RequestScopeLevel.TENANT
        ? combineLatest([
            this.userService.getAll(['role'], undefined, undefined, {
              types: userTypes.length ? userTypes : MANAGED_USER_TYPES,
              withDeleted: true
            }),
            this.userOrganizationsService.getAll(['organization'])
          ]).pipe(
            map(([users, { items }]) => this.mapUsersWithMemberships(users, items)),
            map((users) => this.filterUsers(users, search, roles, userTypes, status, organizationIds, true))
          )
        : this.userOrganizationsService.getAllInOrg(['user', 'user.role', 'organization']).pipe(
            map(({ items }) => this.mapMembershipsToUsers(items)),
            map((users) => this.filterUsers(users, search, roles, userTypes, status, organizationIds, true))
          )
    )
  )

  private refreshSub = this.usersComponent.refresh$.subscribe(() => {
    this.refresh$.next()
  })

  openUser(user: IUser) {
    this.usersComponent.navUser(user)
  }

  userIdentityTitle(user: IUser) {
    return userLabel(user)
  }

  userIdentitySubtitle(user: IUser) {
    return [user.email, user.username && user.username !== userLabel(user) ? user.username : null]
      .filter(Boolean)
      .join(' / ')
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
        await firstValueFrom(this.userService.delete(user.id))
        this.toastrService.success('PAC.NOTES.USERS.UserDelete', {
          name: userLabel(user)
        })
        this.refresh$.next()
      } catch (err) {
        this.toastrService.error(getErrorMessage(err))
      }
    }
  }

  private mapUsersWithMemberships(users: IUser[], memberships: IUserOrganization[]) {
    const organizationsByUserId = new Map<string, IOrganization[]>()

    for (const membership of memberships ?? []) {
      if (membership.userId) {
        organizationsByUserId.set(
          membership.userId,
          this.mergeOrganizations(
            organizationsByUserId.get(membership.userId) ?? [],
            this.organizationsFromMembership(membership)
          )
        )
      }
    }

    return users
      .map((user) => this.toUserRow(user, user.id ? (organizationsByUserId.get(user.id) ?? []) : []))
      .sort((left, right) => userLabel(left).localeCompare(userLabel(right)))
  }

  private mapMembershipsToUsers(memberships: IUserOrganization[]) {
    const users = new Map<string, UserTableRow>()

    for (const membership of memberships ?? []) {
      const user = membership?.user
      if (user?.id) {
        const existing = users.get(user.id)
        users.set(
          user.id,
          this.toUserRow(
            user,
            this.mergeOrganizations(existing?.displayOrganizations ?? [], this.organizationsFromMembership(membership))
          )
        )
      }
    }

    return [...users.values()].sort((left, right) => userLabel(left).localeCompare(userLabel(right)))
  }

  private filterUsers(
    users: UserTableRow[],
    search: string,
    roles: string[],
    userTypes: UserType[],
    status: UserStatusFilter,
    organizationIds: string[],
    allowRoleFilter: boolean
  ) {
    const searchText = search?.toLowerCase().trim()
    const filteredByType = userTypes?.length
      ? users.filter((user) => includes(userTypes, this.normalizedUserType(user)))
      : users
    const filteredByRole =
      allowRoleFilter && roles?.length
        ? filteredByType.filter((user) => user.role?.name && includes(roles, user.role.name))
        : filteredByType
    const filteredByStatus =
      status === 'active'
        ? filteredByRole.filter((user) => !user.deletedAt)
        : status === 'disabled'
          ? filteredByRole.filter((user) => !!user.deletedAt)
          : filteredByRole
    const filteredByOrganization = organizationIds?.length
      ? filteredByStatus.filter((user) =>
          user.displayOrganizations.some(
            (organization) => organization.id && includes(organizationIds, organization.id)
          )
        )
      : filteredByStatus

    if (!searchText) {
      return filteredByOrganization
    }

    return filteredByOrganization.filter(
      (user) =>
        user.name?.toLowerCase().includes(searchText) ||
        user.lastName?.toLowerCase().includes(searchText) ||
        user.firstName?.toLowerCase().includes(searchText) ||
        user.email?.toLowerCase().includes(searchText) ||
        user.username?.toLowerCase().includes(searchText) ||
        user.mobile?.toLowerCase().includes(searchText) ||
        user.displayOrganizations.some((organization) => organization.name?.toLowerCase().includes(searchText)) ||
        this.userTypeDefaultLabel(user.type).toLowerCase().includes(searchText)
    )
  }

  private toUserRow(user: IUser, organizations: IOrganization[]): UserTableRow {
    return {
      ...user,
      displayOrganizations: this.sortOrganizations(organizations)
    }
  }

  private organizationsFromMembership(membership: IUserOrganization): IOrganization[] {
    return membership.organization ? [membership.organization] : []
  }

  private organizationsFromMemberships(memberships: IUserOrganization[]) {
    return this.mergeOrganizations(
      [],
      memberships.flatMap((membership) => this.organizationsFromMembership(membership))
    )
  }

  private canViewAllOrganizations() {
    return [PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT].some((permission) =>
      this.store.hasPermission(permission)
    )
  }

  private mergeOrganizations(left: IOrganization[], right: IOrganization[]) {
    const organizations = new Map<string, IOrganization>()

    for (const organization of [...left, ...right]) {
      const key = organization.id ?? organization.name
      if (key && !organizations.has(key)) {
        organizations.set(key, organization)
      }
    }

    return this.sortOrganizations([...organizations.values()])
  }

  private sortOrganizations(organizations: IOrganization[]) {
    return [...organizations].sort((left, right) => left.name.localeCompare(right.name))
  }

  isTechnicalUser(user: IUser) {
    return user.type === UserType.COMMUNICATION
  }

  userTypeLabelKey(type?: UserType) {
    return this.userTypeOption(type).labelKey
  }

  userTypeDefaultLabel(type?: UserType) {
    return this.userTypeOption(type).defaultLabel
  }

  userTypeBadgeClass(type?: UserType) {
    return this.normalizedUserType({ type } as IUser) === UserType.COMMUNICATION
      ? 'text-text-accent'
      : 'text-text-primary'
  }

  private userTypeOption(type?: UserType) {
    return (
      USER_TYPE_OPTIONS.find((option) => option.value === this.normalizedUserType({ type } as IUser)) ??
      USER_TYPE_OPTIONS[0]
    )
  }

  private normalizedUserType(user: Pick<IUser, 'type'>) {
    return user.type ?? UserType.USER
  }

  private normalizeStatusFilter(value: string | number | Array<string | number>): UserStatusFilter {
    if (Array.isArray(value)) {
      return this.allStatusFilter
    }

    switch (`${value}`) {
      case 'active':
        return 'active'
      case 'disabled':
        return 'disabled'
      default:
        return this.allStatusFilter
    }
  }
}
