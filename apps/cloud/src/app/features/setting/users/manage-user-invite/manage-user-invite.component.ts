import { CommonModule, DatePipe } from '@angular/common'
import { Component, inject, LOCALE_ID } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

import { InviteService, Store, ToastrService } from '@cloud/app/@core/state'
import {
  type IInvite,
  type IOrganization,
  type IRole,
  InvitationExpirationEnum,
  InvitationTypeEnum,
  InviteStatusEnum
} from '@xpert-ai/contracts'
import { injectConfirmDelete } from '@xpert-ai/headless-ui'
import { getErrorMessage } from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user/profile-inline/profile.component'
import { formatDistanceToNow, isAfter } from 'date-fns'
import {
  BehaviorSubject,
  catchError,
  combineLatestWith,
  defer,
  map,
  of,
  startWith,
  switchMap,
  withLatestFrom
} from 'rxjs'
import { XpUsersComponent } from '../users.component'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardTableImports,
  type ZardTableSortDirection,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'

type InviteDisplayStatus = InviteStatusEnum | 'EXPIRED'
type InviteSortColumn = 'email' | 'role' | 'invitedBy' | 'createdAt' | 'expireDate' | 'status'
type InviteSortState = {
  active: InviteSortColumn
  direction: ZardTableSortDirection
}
type InviteRow = Omit<IInvite, 'createdAt' | 'expireDate'> & {
  createdAt: string | null
  expireDate: string | InvitationExpirationEnum.NEVER
  createdAtTime: number
  expireDateTime: number
  displayStatus: InviteDisplayStatus
  statusText: string
}

@Component({
  standalone: true,
  selector: 'xp-manage-user-invite',
  templateUrl: './manage-user-invite.component.html',
  host: { class: 'flex min-w-0 flex-col gap-4' },
  imports: [
    CommonModule,
    FormsModule,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTableImports,
    ...ZardTooltipImports,
    TranslateModule,
    UserProfileInlineComponent
  ]
})
export class ManageUserInviteComponent extends TranslationBaseComponent {
  readonly confirmDelete = injectConfirmDelete()

  private readonly store = inject(Store)
  private readonly inviteService = inject(InviteService)
  private readonly toastrService = inject(ToastrService)
  private readonly locale = inject(LOCALE_ID)
  private readonly usersComponent = inject(XpUsersComponent)

  readonly statusOptions: InviteDisplayStatus[] = [...Object.values(InviteStatusEnum), 'EXPIRED']
  private readonly search$ = new BehaviorSubject('')
  private readonly statusFilter$ = new BehaviorSubject<InviteDisplayStatus | 'all'>('all')

  get search() {
    return this.search$.value
  }
  set search(value: string) {
    this.search$.next(value)
  }
  get statusFilter() {
    return this.statusFilter$.value
  }

  onStatusFilterChange(value: string | number | Array<string | number>) {
    const status = this.statusOptions.find((status) => status === value)
    this.statusFilter$.next(status ?? 'all')
  }

  clearFilters() {
    this.search = ''
    this.statusFilter$.next('all')
  }

  private readonly refresh$ = new BehaviorSubject<void>(null)
  private readonly sortState$ = new BehaviorSubject<InviteSortState>({
    active: 'createdAt',
    direction: 'desc'
  })

  public readonly state$ = this.store.selectedOrganization$.pipe(
    map((org) => org?.id),
    withLatestFrom(this.store.user$.pipe(map((user) => user?.tenantId))),
    combineLatestWith(this.refresh$),
    switchMap(([[organizationId, tenantId]]) => {
      return defer(() =>
        this.inviteService.getAll(['invitedBy', 'role', 'organization', 'organizationContact'], {
          organizationId,
          tenantId
        })
      ).pipe(
        map(({ items }) => ({ status: 'ready' as const, rows: items.map((invite) => this.toInviteRow(invite)) })),
        startWith({ status: 'loading' as const, rows: [] as InviteRow[] }),
        catchError(() => of({ status: 'error' as const, rows: [] as InviteRow[] }))
      )
    }),
    combineLatestWith(this.sortState$, this.search$, this.statusFilter$),
    map(([state, sortState, search, status]) => {
      const query = search.trim().toLowerCase()
      const rows = state.rows.filter(
        (row) =>
          (status === 'all' || row.displayStatus === status) &&
          (!query ||
            [row.email, row.role?.name, row.invitedBy ? userLabel(row.invitedBy) : ''].some((text) =>
              text?.toLowerCase().includes(query)
            ))
      )
      return { ...state, total: state.rows.length, rows: this.sortInviteRows(rows, sortState) }
    })
  )

  private invitedSub = this.usersComponent.invitedEvent.pipe(takeUntilDestroyed()).subscribe(() => {
    this.refresh()
  })

  constructor() {
    super()
  }

  refresh() {
    this.refresh$.next()
  }

  onSortChange(columnName: InviteSortColumn, direction: ZardTableSortDirection) {
    this.sortState$.next({
      active: columnName,
      direction: direction || 'asc'
    })
  }

  sortDirection(columnName: InviteSortColumn): ZardTableSortDirection {
    const sortState = this.sortState$.value
    return sortState.active === columnName ? sortState.direction : ''
  }

  async resendInvite(
    id: string | null | undefined,
    email: string | null | undefined,
    role: IRole | null | undefined,
    organization: IOrganization | null | undefined,
    displayStatus: InviteDisplayStatus
  ) {
    if (!this.canResend(displayStatus)) {
      return
    }

    const targetOrganization = this.store.selectedOrganization ?? organization
    if (!id || !email || !targetOrganization?.id || !role?.name) {
      this.toastrService.error(
        this.getTranslation('XP.Invite.ResendMissingData', {
          Default: 'This invite is missing organization or role information and cannot be resent.'
        })
      )
      return
    }

    try {
      await this.inviteService.resendInvite({
        id,
        invitedById: this.store.userId,
        email,
        roleName: role.name,
        organization: targetOrganization,
        inviteType: InvitationTypeEnum.USER
      })

      this.toastrService.success('TOASTR.MESSAGE.INVITES_RESEND', {
        email,
        Default: `Invite '${email}' resent`
      })
      this.refresh$.next()
    } catch (error) {
      this.toastrService.error(getErrorMessage(error))
    }
  }

  async deleteInvite(id: string | null | undefined, email: string | null | undefined) {
    if (!id || !email) {
      return
    }

    this.confirmDelete(
      {
        value: email,
        information: this.translateService.instant('XP.USERS_PAGE.ConfirmDeleteInvite', {
          Default: 'After deletion, the invited user will no longer be able to confirm the invitation'
        })
      },
      this.inviteService.delete(id)
    ).subscribe({
      next: () => {
        this.toastrService.success('TOASTR.MESSAGE.INVITES_DELETE', {
          email: email,
          Default: "Invite '" + email + "' delete"
        })
        this.refresh$.next()
      },
      error: (err) => {
        this.toastrService.error(getErrorMessage(err))
      }
    })
  }

  canResend(displayStatus: InviteDisplayStatus | null | undefined) {
    return !!displayStatus && displayStatus !== InviteStatusEnum.ACCEPTED
  }

  statusTone(status: InviteDisplayStatus) {
    switch (status) {
      case InviteStatusEnum.ACCEPTED:
        return 'bg-text-success'
      case 'EXPIRED':
        return 'bg-text-warning'
      default:
        return 'bg-text-accent'
    }
  }

  private getDisplayStatus(invite: IInvite): InviteDisplayStatus {
    if (
      invite.status !== InviteStatusEnum.ACCEPTED &&
      invite.expireDate &&
      !isAfter(new Date(invite.expireDate), new Date())
    ) {
      return 'EXPIRED'
    }

    return invite.status as InviteStatusEnum
  }

  private toInviteRow(invite: IInvite): InviteRow {
    const createdAtDate = invite.createdAt ? new Date(invite.createdAt) : null
    const expireDate = invite.expireDate ? new Date(invite.expireDate) : null
    const createdAtTime = this.validDateTime(createdAtDate)
    const expireDateTime = this.validDateTime(expireDate)
    const displayStatus = this.getDisplayStatus(invite)

    return {
      ...invite,
      createdAt: createdAtTime ? new DatePipe(this.locale).transform(createdAtDate) : null,
      expireDate: expireDate && expireDateTime ? formatDistanceToNow(expireDate) : InvitationExpirationEnum.NEVER,
      createdAtTime,
      expireDateTime: expireDateTime || Number.MAX_SAFE_INTEGER,
      displayStatus,
      statusText: this.getTranslation(`XP.INVITE_PAGE.STATUS.${displayStatus}`, {
        Default: displayStatus
      })
    }
  }

  private sortInviteRows(rows: InviteRow[], sortState: InviteSortState) {
    if (!sortState.direction) {
      return rows
    }

    return [...rows].sort((left, right) => {
      const result = this.compareSortValues(
        this.getInviteSortValue(left, sortState.active),
        this.getInviteSortValue(right, sortState.active)
      )

      return sortState.direction === 'asc' ? result : -result
    })
  }

  private getInviteSortValue(row: InviteRow, columnName: InviteSortColumn): string | number {
    switch (columnName) {
      case 'role':
        return row.role?.name ?? ''
      case 'invitedBy':
        return row.invitedBy ? userLabel(row.invitedBy) : ''
      case 'createdAt':
        return row.createdAtTime
      case 'expireDate':
        return row.expireDateTime
      case 'status':
        return row.statusText
      default:
        return row.email ?? ''
    }
  }

  private compareSortValues(left: string | number, right: string | number) {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right
    }

    return `${left}`.localeCompare(`${right}`)
  }

  private validDateTime(date: Date | null) {
    const time = date?.getTime() ?? 0
    return Number.isNaN(time) ? 0 : time
  }
}
