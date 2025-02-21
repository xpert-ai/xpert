import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatButtonModule } from '@angular/material/button'
import { injectConfirmDelete, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { differenceWith } from 'lodash-es'
import { BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { IOrganization, OrganizationsService, ToastrService, UsersOrganizationsService } from '../../../../@core'
import { PACEditUserComponent } from '../edit-user/edit-user.component'
import { ActivatedRoute, Router } from '@angular/router'

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
  imports: [SharedModule, CdkMenuModule, MatButtonModule, UserProfileInlineComponent, NgmTableComponent]
})
export class PACUserOrganizationsComponent extends TranslationBaseComponent {
  readonly confirmDelete = injectConfirmDelete()
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)

  private readonly refresh$ = new BehaviorSubject<void>(null)
  readonly userOrganizations = toSignal(
    combineLatest([this.userComponent.userId$, this.refresh$]).pipe(
      switchMap(([userId]) => this.userOrganizationsService.getAll(['user', 'organization'], { userId })),
      map(({ items }) => items)
    )
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

  async removeOrg(id: string, organization: IOrganization) {
    this.confirmDelete(
      {
        value: organization?.name,
        information:
          this.userOrganizations().length === 1
            ? this.getTranslation('PAC.USERS_PAGE.RemoveDelUserFromOrg', {
                Default: 'Remove and delete this user from this organization'
              })
            : this.getTranslation('PAC.USERS_PAGE.RemoveUserFromOrg', {
                Default: 'Remove this user from this organization'
              })
      },
      this.userOrganizationsService.removeUserFromOrg(id)
    ).subscribe({
      next: () => {
        this._toastrService.success(`PAC.MESSAGE.USER_ORGANIZATION_REMOVED`, { Default: 'User Org Removed' })
        if (this.userOrganizations().length === 1) {
          this.router.navigate(['..'], { relativeTo: this.route })
        } else {
          this.refresh$.next()
        }
      },
      error: (err) => {
        this._toastrService.error(err)
      }
    })
  }
}
