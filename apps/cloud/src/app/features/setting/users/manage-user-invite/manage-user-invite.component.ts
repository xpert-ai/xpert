import { CommonModule, DatePipe, Location } from '@angular/common'
import { Component, Inject, inject, LOCALE_ID } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { InviteService, Store, ToastrService } from '@metad/cloud/state'
import { InvitationExpirationEnum, InvitationTypeEnum } from '@metad/contracts'
import { injectConfirmDelete, NgmTableComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { getErrorMessage } from 'apps/cloud/src/app/@core'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { formatDistanceToNow, isAfter } from 'date-fns'
import { BehaviorSubject, combineLatestWith, firstValueFrom, map, switchMap, withLatestFrom } from 'rxjs'
import { InviteMutationComponent } from '../../../../@shared/invite'
import { PACUsersComponent } from '../users.component'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'pac-manage-user-invite',
  templateUrl: './manage-user-invite.component.html',
  styleUrls: ['./manage-user-invite.component.scss'],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
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
  userLabel = userLabel
  invitationTypeEnum = InvitationTypeEnum

  readonly confirmDelete = injectConfirmDelete()

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

  async deleteInvite(id: string, email: string) {
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
}
