import { DatePipe, Location } from '@angular/common'
import { Component, Inject, LOCALE_ID, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { InviteService, Store, ToastrService } from '@metad/cloud/state'
import { InvitationExpirationEnum, InvitationTypeEnum } from '@metad/contracts'
import { ButtonGroupDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { formatDistanceToNow, isAfter } from 'date-fns'
import { BehaviorSubject, combineLatestWith, firstValueFrom, map, switchMap, withLatestFrom } from 'rxjs'
import { InviteMutationComponent } from '../../../../@shared/invite'
import { PACUsersComponent } from '../users.component'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { InlineSearchComponent } from 'apps/cloud/src/app/@shared/form-fields'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'

@Component({
  standalone: true,
  selector: 'pac-manage-user-invite',
  templateUrl: './manage-user-invite.component.html',
  styleUrls: ['./manage-user-invite.component.scss'],
  imports: [
    SharedModule,
    MaterialModule,
    // Standard components
    ButtonGroupDirective,
    InlineSearchComponent,
    // OCAP Modules
    OcapCoreModule,
    UserProfileInlineComponent,
    NgmTableComponent
  ]
})
export class ManageUserInviteComponent extends TranslationBaseComponent {
  userLabel = userLabel
  invitationTypeEnum = InvitationTypeEnum

  private readonly usersComponent = inject(PACUsersComponent)

  private readonly refresh$ = new BehaviorSubject<void>(null)

  public readonly organizationName$ = this.store.selectedOrganization$.pipe(map((org) => org?.name))

  public readonly invites$ = this.store.selectedOrganization$.pipe(
    map((org) => org?.id),
    withLatestFrom(this.store.user$.pipe(map((user) => user?.tenantId))),
    combineLatestWith(this.refresh$),
    switchMap(([[organizationId, tenantId]]) => {
      return this.inviteService.getAll(['projects', 'invitedBy', 'role', 'organizationContact', 'departments'], {
        organizationId,
        tenantId
      })
    }),
    map(({ items }) =>
      items.map((invite) => ({
        ...invite,
        createdAt: new DatePipe(this._locale).transform(new Date(invite.createdAt)),
        expireDate: invite.expireDate
          ? formatDistanceToNow(new Date(invite.expireDate))
          : InvitationExpirationEnum.NEVER,
        statusText:
          invite.status === 'ACCEPTED' || !invite.expireDate || isAfter(new Date(invite.expireDate), new Date())
            ? this.getTranslation(`PAC.INVITE_PAGE.STATUS.${invite.status}`, { Default: invite.status })
            : this.getTranslation(`PAC.INVITE_PAGE.STATUS.EXPIRED`, { Default: 'EXPIRED' })
      }))
    )
  )

  private invitedSub = this.usersComponent.invitedEvent.pipe(takeUntilDestroyed()).subscribe(() => {
    this.refresh()
  })

  constructor(
    private readonly store: Store,
    private readonly inviteService: InviteService,
    private readonly toastrService: ToastrService,
    private _dialog: MatDialog,
    @Inject(LOCALE_ID)
    private _locale: string,
    private location: Location
  ) {
    super()
  }

  back(): void {
    this.location.back()
  }

  refresh() {
    this.refresh$.next()
  }

  async invite() {
    const dialog = this._dialog.open(InviteMutationComponent)

    const result = await firstValueFrom(dialog.afterClosed())
    // 成功邀请人数
    if (result?.total) {
      this.refresh$.next()
    }
  }

  async deleteInvite(id, email) {
    await this.inviteService.delete(id)
    this.toastrService.success('TOASTR.MESSAGE.INVITES_DELETE', {
      email: email,
      Default: "Invite '" + email + "' delete"
    })
    this.refresh$.next()
  }
}
