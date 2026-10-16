import { Component, computed, inject } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ToastrService, UsersService } from '@cloud/app/@core/state'
import {
  type IUser,
  type IUserDirectoryItem,
  type IUserDirectoryQuery,
  PermissionsEnum,
  RolesEnum,
  UserType
} from '@xpert-ai/contracts'
import { XpConfirmDeleteService } from '@xpert-ai/headless-ui'
import {
  DateRelativePipe,
  getErrorMessage,
  OrganizationsService,
  RequestScopeLevel,
  RoleService,
  Store
} from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import {
  BehaviorSubject,
  EMPTY,
  catchError,
  combineLatest,
  firstValueFrom,
  map,
  of,
  shareReplay,
  startWith,
  switchMap
} from 'rxjs'
import { XpUsersComponent } from '../users.component'
import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { RouterModule } from '@angular/router'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardPaginatorComponent,
  type ZardPageEvent,
  ZardSelectImports,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { distinctUntilChanged } from 'rxjs/operators'

type UserStatusFilter = 'all' | 'active' | 'disabled'
type UserTableRow = IUserDirectoryItem

const MANAGED_USER_TYPES = [UserType.USER, UserType.COMMUNICATION]
const DEFAULT_USER_TYPES = [UserType.USER]

const USER_TYPE_OPTIONS: Array<{ value: UserType; labelKey: string; defaultLabel: string }> = [
  {
    value: UserType.USER,
    labelKey: 'XP.Users.UserTypes.Regular',
    defaultLabel: 'Regular user'
  },
  {
    value: UserType.COMMUNICATION,
    labelKey: 'XP.Users.UserTypes.Technical',
    defaultLabel: 'Technical user'
  }
]

const USER_STATUS_OPTIONS: Array<{ value: UserStatusFilter; labelKey: string; defaultLabel: string }> = [
  {
    value: 'all',
    labelKey: 'XP.KEY_WORDS.All',
    defaultLabel: 'All'
  },
  {
    value: 'active',
    labelKey: 'XP.KEY_WORDS.Active',
    defaultLabel: 'Active'
  },
  {
    value: 'disabled',
    labelKey: 'XP.KEY_WORDS.Disabled',
    defaultLabel: 'Disabled'
  }
]

@Component({
  standalone: true,
  selector: 'xp-manage-user',
  templateUrl: './manage-user.component.html',
  host: { class: 'flex min-w-0 flex-col gap-4' },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ZardPaginatorComponent,
    ...ZardSelectImports,
    ...ZardTableImports,
    ...ZardTooltipImports,
    DateRelativePipe
  ]
})
export class ManageUserComponent extends TranslationBaseComponent {
  private usersComponent = inject(XpUsersComponent)
  private readonly store = inject(Store)
  private userService = inject(UsersService)
  private readonly roleService = inject(RoleService)
  private readonly organizationsService = inject(OrganizationsService)
  private readonly _confirmDelete = inject(XpConfirmDeleteService)
  private toastrService = inject(ToastrService)

  readonly defaultRoleBadgeClass = 'text-text-primary'
  readonly roleBadgeClassMap: Record<string, string> = {
    [RolesEnum.VIEWER]: 'text-text-secondary',
    [RolesEnum.ADMIN]: 'text-text-warning',
    [RolesEnum.SUPER_ADMIN]: 'text-text-destructive',
    [RolesEnum.AI_BUILDER]: 'text-text-accent'
  }

  private search$ = new BehaviorSubject<string>('')
  readonly userTypeQuickFilters: Array<{ value: UserType | null; labelKey: string; defaultLabel: string }> = [
    {
      value: null,
      labelKey: 'XP.KEY_WORDS.All',
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
  private readonly scope$ = this.store
    .selectActiveScope()
    .pipe(
      distinctUntilChanged(
        (left, right) =>
          left.level === right.level &&
          (left.level === RequestScopeLevel.TENANT ||
            (right.level === RequestScopeLevel.ORGANIZATION && left.organizationId === right.organizationId))
      )
    )

  roles$ = new BehaviorSubject<string[]>([])
  readonly availableRoles$ = this.roleService.getAll().pipe(
    map(({ items }) => items.map(({ name }) => name)),
    shareReplay({ bufferSize: 1, refCount: true })
  )
  readonly availableOrganizations$ = this.scope$.pipe(
    switchMap((scope) =>
      scope.level === RequestScopeLevel.TENANT && this.canViewAllOrganizations()
        ? this.organizationsService
            .getAll()
            .pipe(map(({ items }) => [...items].sort((left, right) => left.name.localeCompare(right.name))))
        : of(
            scope.level === RequestScopeLevel.ORGANIZATION &&
              this.store.selectedOrganization?.id === scope.organizationId
              ? [this.store.selectedOrganization]
              : []
          )
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

  readonly refresh$ = new BehaviorSubject<void>(null)
  private readonly pagination$ = new BehaviorSubject({ pageIndex: 0, pageSize: 20 })
  private total = 0
  public readonly state$ = combineLatest([
    this.scope$,
    this.roles$,
    this.userTypes$,
    this.search$,
    this.status$,
    this.organizationIds$
  ]).pipe(
    switchMap(([, roles, userTypes, search, status, organizationIds]) => {
      this.total = 0
      this.pagination$.next({ pageIndex: 0, pageSize: this.pagination$.value.pageSize })
      const filters: IUserDirectoryQuery = {
        types: userTypes.length ? userTypes : MANAGED_USER_TYPES,
        roles,
        search: search.trim(),
        status,
        organizationIds
      }
      return combineLatest([this.refresh$, this.pagination$]).pipe(
        switchMap(([, page]) =>
          this.userService
            .getDirectory({
              ...filters,
              take: page.pageSize,
              skip: page.pageIndex * page.pageSize
            })
            .pipe(
              switchMap(({ items, total }) => {
                this.total = total
                const lastPage = Math.max(0, Math.ceil(total / page.pageSize) - 1)
                if (page.pageIndex > lastPage) {
                  this.pagination$.next({ ...page, pageIndex: lastPage })
                  return EMPTY
                }
                return of({ status: 'ready' as const, users: items, total, ...page })
              }),
              startWith({ status: 'loading' as const, users: [] as UserTableRow[], total: this.total, ...page }),
              catchError(() =>
                of({ status: 'error' as const, users: [] as UserTableRow[], total: this.total, ...page })
              )
            )
        )
      )
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  )

  onPage(event: ZardPageEvent) {
    this.pagination$.next({
      pageIndex: event.pageSize === this.pagination$.value.pageSize ? event.pageIndex : 0,
      pageSize: event.pageSize
    })
  }

  private refreshSub = this.usersComponent.refresh$.pipe(takeUntilDestroyed()).subscribe(() => {
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
        this.toastrService.success('XP.NOTES.USERS.UserDelete', {
          name: userLabel(user)
        })
        this.refresh$.next()
      } catch (err) {
        this.toastrService.error(getErrorMessage(err))
      }
    }
  }

  private canViewAllOrganizations() {
    return [PermissionsEnum.ALL_ORG_VIEW, PermissionsEnum.ALL_ORG_EDIT].some((permission) =>
      this.store.hasPermission(permission)
    )
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
