import { Component } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { NgmConfirmDeleteComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { differenceWith } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs'
import { map, shareReplay, switchMap } from 'rxjs/operators'
import { IOrganization, OrganizationsService, ToastrService, UsersOrganizationsService } from '../../../../@core'
import { PACEditUserComponent } from '../edit-user/edit-user.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'

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
  imports: [SharedModule, MaterialModule, UserProfileInlineComponent, NgmTableComponent]
})
export class PACUserOrganizationsComponent extends TranslationBaseComponent {
  private readonly refresh$ = new BehaviorSubject<void>(null)
  public readonly userOrganizations$ = combineLatest([this.userComponent.userId$, this.refresh$]).pipe(
    switchMap(([userId]) => this.userOrganizationsService.getAll(['user', 'organization'], { userId })),
    map(({ items }) => items),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly organizations = toSignal(
    combineLatest([this.organizationsService.getAll([]).pipe(map(({ items }) => items)), this.userOrganizations$]).pipe(
      map(([organizations, userOrganizations]) => {
        return differenceWith(organizations, userOrganizations, (arrVal, othVal) => arrVal.id === othVal.organizationId)
      })
    )
  )

  constructor(
    private readonly userComponent: PACEditUserComponent,
    private readonly organizationsService: OrganizationsService,
    private readonly userOrganizationsService: UsersOrganizationsService,
    private readonly _dialog: MatDialog,
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

  async removeOrg(id: string, organization) {
    const confirm = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: organization?.name } }).afterClosed()
    )
    if (confirm) {
      try {
        await firstValueFrom(this.userOrganizationsService.removeUserFromOrg(id))
        this._toastrService.success(`PAC.MESSAGE.USER_ORGANIZATION_REMOVED`, { Default: 'User Org Removed' })
        this.refresh$.next()
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }
}
