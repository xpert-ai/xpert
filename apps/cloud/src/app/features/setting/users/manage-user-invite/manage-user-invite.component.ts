import { CommonModule, DatePipe } from '@angular/common'
import { Component, inject, LOCALE_ID } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

import { InviteService, Store, ToastrService } from '@xpert-ai/cloud/state'
import { type IInvite, type IOrganization, type IRole, InvitationExpirationEnum, InvitationTypeEnum, InviteStatusEnum } from '@xpert-ai/contracts'
import { injectConfirmDelete, NgmTableComponent } from '@xpert-ai/ocap-angular/common'
import { ButtonGroupDirective, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { getErrorMessage } from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { formatDistanceToNow, isAfter } from 'date-fns'
import { BehaviorSubject, combineLatestWith, map, switchMap, withLatestFrom } from 'rxjs'
import { PACUsersComponent } from '../users.component'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'

type InviteDisplayStatus = InviteStatusEnum | 'EXPIRED'
type InviteRow = IInvite & {
  createdAt: string | null
  expireDate: string | number
  displayStatus: InviteDisplayStatus
  statusText: string
}

@Component({
  standalone: true,
  selector: 'pac-manage-user-invite',
  templateUrl: './manage-user-invite.component.html',
  styleUrls: ['./manage-user-invite.component.scss'],
  imports: [
    CommonModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTooltipImports,
    TranslateModule,
    // Standard components
    ButtonGroupDirective,
    // OCAP Modules
    OcapCoreModule,
    UserProfileInlineComponent,
    NgmTableComponent
  ]
})
export class ManageUserInviteComponent extends TranslationBaseComponent {
  readonly confirmDelete = injectConfirmDelete()

  private readonly store = inject(Store)
  private readonly inviteService = inject(InviteService)
  private readonly toastrService = inject(ToastrService)
  private readonly locale = inject(LOCALE_ID)
  private readonly usersComponent = inject(PACUsersComponent)

  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly invites$ = this.store.selectedOrganization$.pipe(
    map((org) => org?.id),
    withLatestFrom(this.store.user$.pipe(map((user) => user?.tenantId))),
    combineLatestWith(this.refresh$),
    switchMap(([[organizationId, tenantId]]) => {
      return this.inviteService.getAll(['invitedBy', 'role', 'organization', 'organizationContact'], {
        organizationId,
        tenantId
      })
    }),
    map(({ items }) =>
      items.map((invite) => ({
        ...invite,
        createdAt: new DatePipe(this.locale).transform(new Date(invite.createdAt)),
        expireDate: invite.expireDate
          ? formatDistanceToNow(new Date(invite.expireDate))
          : InvitationExpirationEnum.NEVER,
        displayStatus: this.getDisplayStatus(invite),
        statusText: this.getTranslation(`PAC.INVITE_PAGE.STATUS.${this.getDisplayStatus(invite)}`, {
          Default: this.getDisplayStatus(invite)
        })
      } as InviteRow))
    )
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

  async resendInvite(
    id: string,
    email: string,
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
        this.getTranslation('PAC.Invite.ResendMissingData', {
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

  async deleteInvite(id: string, email: string) {
    if (!id || !email) {
      return
    }

    this.confirmDelete({
      value: email,
      information: this.translateService.instant('PAC.USERS_PAGE.ConfirmDeleteInvite', {Default: 'After deletion, the invited user will no longer be able to confirm the invitation'})
    }, this.inviteService.delete(id)).subscribe({
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
}
