import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'

import { injectConfirmDelete, NgmTableComponent } from '@xpert-ai/ocap-angular/common'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { differenceWith } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  getErrorMessage,
  IOrganization,
  IUserOrganization,
  OrganizationsService,
  ToastrService,
  UsersOrganizationsService
} from '../../../../@core'
import { PACEditUserComponent } from '../edit-user/edit-user.component'
import { ZardButtonComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-user-organizations',
  templateUrl: 'organizations.component.html',
  styles: [
    `
      :host {
        width: 100%;
        display: flex;
        flex-direction: column;
      }
    `
  ],
  imports: [
    SharedModule,
    CdkMenuModule,
    ZardButtonComponent,
    ZardSwitchComponent,
    UserProfileInlineComponent,
    NgmTableComponent
  ]
})
export class PACUserOrganizationsComponent extends TranslationBaseComponent {
  readonly confirmDelete = injectConfirmDelete()

  private readonly refresh$ = new BehaviorSubject<void>(null)
  readonly userOrganizations = toSignal(
    combineLatest([this.userComponent.userId$, this.refresh$]).pipe(
      switchMap(([userId]) => this.userOrganizationsService.getAll(['user', 'organization'], { userId })),
      map(({ items }) => items)
    )
  )
  readonly activeMembershipCount = computed(
    () => this.userOrganizations()?.filter((membership) => membership.isActive).length ?? 0
  )

  public readonly organizations = toSignal(
    combineLatest([
      this.organizationsService.getAll([]).pipe(map(({ items }) => items)),
      toObservable(this.userOrganizations)
    ]).pipe(
      map(([organizations, userOrganizations]) => {
        return differenceWith(organizations, userOrganizations, (arrVal, othVal) => arrVal.id === othVal.organizationId)
      })
    )
  )

  constructor(
    private readonly userComponent: PACEditUserComponent,
    private readonly organizationsService: OrganizationsService,
    private readonly userOrganizationsService: UsersOrganizationsService,
    private _toastrService: ToastrService
  ) {
    super()
  }

  async addOrg(org: IOrganization) {
    const user = this.userComponent.user()
    if (user) {
      try {
        await firstValueFrom(
          this.userOrganizationsService.create({ userId: user.id, organizationId: org.id, isActive: true })
        )
        this._toastrService.success(`PAC.MESSAGE.USER_ORGANIZATION_ADDED`, { Default: 'User Org Added' })
        this.refresh$.next()
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }

  async updateDefaultMembership(membership: IUserOrganization, enabled: boolean) {
    if (!enabled || membership.isDefault) {
      return
    }

    try {
      await firstValueFrom(this.userOrganizationsService.update(membership.id, { isDefault: true }))
      this._toastrService.success('PAC.Users.DefaultOrganizationUpdated', {
        Default: 'Default organization updated'
      })
      this.refresh$.next()
    } catch (error) {
      this._toastrService.error(getErrorMessage(error))
    }
  }

  async updateMembershipActiveState(membership: IUserOrganization, isActive: boolean) {
    if (membership.isActive === isActive) {
      return
    }

    try {
      await firstValueFrom(this.userOrganizationsService.update(membership.id, { isActive }))
      this._toastrService.success('PAC.Users.OrganizationStatusUpdated', {
        Default: 'Organization membership updated'
      })
      this.refresh$.next()
    } catch (error) {
      this._toastrService.error(getErrorMessage(error))
    }
  }

  canRemoveMembership(membership: IUserOrganization) {
    const totalMemberships = this.userOrganizations()?.length ?? 0
    const isLastActiveMembership = membership.isActive && this.activeMembershipCount() <= 1
    return totalMemberships > 1 && !isLastActiveMembership
  }

  canDeactivateMembership(membership: IUserOrganization) {
    return membership.isActive && this.activeMembershipCount() <= 1
  }

  membershipById(id: string) {
    return this.userOrganizations()?.find((membership) => membership.id === id) ?? null
  }

  async removeOrg(id: string, organization: IOrganization) {
    if ((this.userOrganizations()?.length ?? 0) <= 1) {
      return
    }

    this.confirmDelete(
      {
        value: organization?.name,
        information: this.getTranslation('PAC.USERS_PAGE.RemoveUserFromOrg', {
          Default: 'Remove this user from this organization'
        })
      },
      this.userOrganizationsService.removeUserFromOrg(id)
    ).subscribe({
      next: () => {
        this._toastrService.success(`PAC.MESSAGE.USER_ORGANIZATION_REMOVED`, { Default: 'User Org Removed' })
        this.refresh$.next()
      },
      error: (err) => {
        this._toastrService.error(getErrorMessage(err))
      }
    })
  }
}
