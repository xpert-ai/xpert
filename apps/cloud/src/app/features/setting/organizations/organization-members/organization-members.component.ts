import { Dialog } from '@angular/cdk/dialog'
import { Component, Input, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { injectConfirmDelete, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { userLabel } from 'apps/cloud/src/app/@shared/pipes'
import { UserProfileInlineComponent, UserRoleSelectComponent } from 'apps/cloud/src/app/@shared/user'
import { BehaviorSubject, combineLatest, firstValueFrom, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { IUser } from '@metad/contracts'
import {
  getErrorMessage,
  IUserOrganization,
  ToastrService,
  UsersOrganizationsService
} from '../../../../@core'
import { SharedModule } from '../../../../@shared/shared.module'
import { ZardButtonComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-organization-members',
  templateUrl: './organization-members.component.html',
  host: {
    class: 'block w-full min-w-0'
  },
  imports: [
    SharedModule,
    ZardButtonComponent,
    ZardSwitchComponent,
    UserProfileInlineComponent,
    NgmTableComponent
  ]
})
export class OrganizationMembersComponent extends TranslationBaseComponent {
  readonly confirmDelete = injectConfirmDelete()

  private readonly userOrganizationsService = inject(UsersOrganizationsService)
  private readonly toastrService = inject(ToastrService)
  private readonly dialog = inject(Dialog)

  private readonly organizationId$ = new BehaviorSubject<string | null>(null)
  private readonly refresh$ = new BehaviorSubject<void>(undefined)

  @Input() set organizationId(value: string | null) {
    this.organizationId$.next(value ?? null)
  }

  @Input() canEdit = false

  readonly memberships = toSignal(
    combineLatest([this.organizationId$, this.refresh$]).pipe(
      switchMap(([organizationId]) =>
        organizationId
          ? this.userOrganizationsService
              .getAll(
                ['user', 'user.role', 'user.organizations', 'user.organizations.organization'],
                { organizationId }
              )
              .pipe(
                map(({ items }) =>
                  [...items].sort((left, right) => {
                    if (left.isDefault !== right.isDefault) {
                      return Number(right.isDefault) - Number(left.isDefault)
                    }

                    return userLabel(left.user).localeCompare(userLabel(right.user))
                  })
                )
              )
          : of([])
      )
    ),
    { initialValue: [] }
  )

  async openMemberSelect() {
    const organizationId = this.organizationId$.value
    if (!organizationId || !this.canEdit) {
      return
    }

    const value = await firstValueFrom(
      this.dialog.open<{ users: IUser[] }>(UserRoleSelectComponent, {
        data: {
          emptyHint: this.getTranslation('FORM.PLACEHOLDERS.MEMBERS_EMPTY_HINT', {
            Default: 'Use the input on the right to search and add members'
          }),
          searchOptions: {
            organizationId,
            membership: 'non-members'
          }
        }
      }).closed
    )

    const users = value?.users ?? []
    if (!users.length) {
      return
    }

    const results = await Promise.allSettled(
      users.map((user) =>
        firstValueFrom(
          this.userOrganizationsService.create({
            userId: user.id,
            organizationId
          })
        )
      )
    )

    const successCount = results.filter((result) => result.status === 'fulfilled').length
    const firstFailure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined

    if (successCount) {
      this.toastrService.success('PAC.Organization.MemberAdded', {
        Default: successCount === 1 ? 'Member added' : `${successCount} members added`
      })
      this.refresh$.next()
    }

    if (firstFailure) {
      this.toastrService.error(getErrorMessage(firstFailure.reason))
    }
  }

  async updateDefaultMembership(membership: IUserOrganization, enabled: boolean) {
    if (!this.canEdit || !enabled || membership.isDefault) {
      return
    }

    try {
      await firstValueFrom(this.userOrganizationsService.update(membership.id, { isDefault: true }))
      this.toastrService.success('PAC.Users.DefaultOrganizationUpdated', {
        Default: 'Default organization updated'
      })
      this.refresh$.next()
    } catch (error) {
      this.toastrService.error(getErrorMessage(error))
    }
  }

  async updateMembershipActiveState(membership: IUserOrganization, isActive: boolean) {
    if (!this.canEdit || membership.isActive === isActive) {
      return
    }

    try {
      await firstValueFrom(this.userOrganizationsService.update(membership.id, { isActive }))
      this.toastrService.success('PAC.Users.OrganizationStatusUpdated', {
        Default: 'Organization membership updated'
      })
      this.refresh$.next()
    } catch (error) {
      this.toastrService.error(getErrorMessage(error))
    }
  }

  canRemoveMembership(membership: IUserOrganization) {
    const totalMemberships = membership.user?.organizations?.length
    const activeMemberships = membership.user?.organizations?.filter((item) => item.isActive).length
    const isLastActiveMembership =
      membership.isActive && activeMemberships !== undefined ? activeMemberships <= 1 : false

    return totalMemberships === undefined ? true : totalMemberships > 1 && !isLastActiveMembership
  }

  canDeactivateMembership(membership: IUserOrganization) {
    const activeMemberships = membership.user?.organizations?.filter((item) => item.isActive).length
    return membership.isActive && activeMemberships !== undefined ? activeMemberships <= 1 : false
  }

  membershipById(id: string) {
    return this.memberships()?.find((membership) => membership.id === id) ?? null
  }

  async removeMember(membership: IUserOrganization) {
    if (!this.canEdit) {
      return
    }

    this.confirmDelete(
      {
        value: userLabel(membership.user),
        information: this.getTranslation('PAC.USERS_PAGE.RemoveUserFromOrg', {
          Default: 'Remove this user from this organization'
        })
      },
      this.userOrganizationsService.removeUserFromOrg(membership.id)
    ).subscribe({
      next: () => {
        this.toastrService.success('PAC.MESSAGE.USER_ORGANIZATION_REMOVED', {
          Default: 'User Org Removed'
        })
        this.refresh$.next()
      },
      error: (error) => {
        this.toastrService.error(getErrorMessage(error))
      }
    })
  }
}
