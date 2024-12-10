import { SelectionModel } from '@angular/cdk/collections'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { Router, RouterModule } from '@angular/router'
import { NgmConfirmDeleteComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom, map, shareReplay, switchMap } from 'rxjs'
import { IOrganization, OrganizationsService, ToastrService } from '../../../../@core'
import { OrganizationsComponent } from '../organizations.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { OrgAvatarComponent } from 'apps/cloud/src/app/@shared/organization'

@Component({
  standalone: true,
  selector: 'pac-all-organizations',
  templateUrl: './organizations.component.html',
  styleUrls: ['./organizations.component.scss'],
  imports: [
    CommonModule,
    MaterialModule,
    TranslateModule,
    RouterModule,
    AppearanceDirective,
    OrgAvatarComponent,
    NgmTableComponent
  ]
})
export class AllOrganizationsComponent extends TranslationBaseComponent {
  readonly #organizationsComponent = inject(OrganizationsComponent)

  readonly refresh$ = this.#organizationsComponent.refresh$
  public readonly organizations$ = this.refresh$.pipe(
    switchMap(() => this.organizationsService.getAll().pipe(map(({ items }) => items))),
    shareReplay(1)
  )

  public readonly selection = new SelectionModel<string>()

  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly router: Router,
    private readonly _dialog: MatDialog,
    private _toastrService: ToastrService
  ) {
    super()
  }

  checkSelected(org: IOrganization) {
    return this.selection.isSelected(org.id)
  }

  toggle(org: IOrganization) {
    this.selection.toggle(org.id)
  }

  editOrganization(id) {
    this.router.navigate(['/settings/organizations/', id])
  }

  // async addOrganization() {
  //   const org = await firstValueFrom(this._dialog.open(OrganizationMutationComponent).afterClosed())
  //   if (org) {
  //     try {
  //       await firstValueFrom(this.organizationsService.create(org))
  //       this._toastrService.success('NOTES.ORGANIZATIONS.ADD_NEW_ORGANIZATION', { Default: 'Add New Organization' })
  //       this.refresh$.next()
  //     } catch (err) {
  //       this._toastrService.error(err)
  //     }
  //   }
  // }

  async deleteOrganization(id: string) {
    const organizations = await firstValueFrom(this.organizations$)
    const organization = organizations.find((item) => item.id === id)
    const information = await firstValueFrom(
      this.getTranslation('PAC.NOTES.ORGANIZATIONS.DELETE_CONFIRM', {
        Default: 'Confirm to delete the org from server?'
      })
    )
    const confirm = await firstValueFrom(
      this._dialog
        .open(NgmConfirmDeleteComponent, {
          data: {
            value: organization?.name,
            information
          }
        })
        .afterClosed()
    )

    if (confirm) {
      try {
        await firstValueFrom(this.organizationsService.delete(organization.id))
        this._toastrService.success('PAC.NOTES.ORGANIZATIONS.DELETE_ORGANIZATION', {
          Default: `Organization '{{ name }}' was removed`,
          name: organization.name
        })
        this.refresh$.next()
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }
}
