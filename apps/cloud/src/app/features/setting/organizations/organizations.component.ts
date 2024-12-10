import { SelectionModel } from '@angular/cdk/collections'
import { Component } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { IOrganization, OrganizationsService, ToastrService, routeAnimations } from '../../../@core'
import { OrganizationMutationComponent } from './organization-mutation/organization-mutation.component'
import { ManageEntityBaseComponent } from '../../../@shared/directives'


@Component({
  selector: 'pac-organizations',
  templateUrl: './organizations.component.html',
  styleUrls: ['./organizations.component.scss'],
  animations: [
    routeAnimations
  ]
})
export class OrganizationsComponent extends ManageEntityBaseComponent<IOrganization> {
  readonly refresh$ = new BehaviorSubject<void>(null)
  // public readonly organizations$ = this.refresh$.pipe(
  //   switchMap(() => this.organizationsService.getAll().pipe(map(({ items }) => items))),
  //   shareReplay(1)
  // )

  public readonly selection = new SelectionModel<string>()

  constructor(
    private readonly organizationsService: OrganizationsService,
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
    this.router.navigate(['/settings/organizations/edit/', id])
  }

  async addOrganization() {
    const org = await firstValueFrom(this._dialog.open(OrganizationMutationComponent).afterClosed())
    if (org) {
      try {
        await firstValueFrom(this.organizationsService.create(org))
        this._toastrService.success('PAC.NOTES.ORGANIZATIONS.AddNewOrganization', { Default: 'Add New Organization' })
        this.refresh$.next()
      } catch (err) {
        this._toastrService.error(err)
      }
    }
  }

  // async deleteOrganization(id: string) {
  //   const organizations = await firstValueFrom(this.organizations$)
  //   const organization = organizations.find((item) => item.id === id)
  //   const information = await firstValueFrom(
  //     this.getTranslation('PAC.NOTES.ORGANIZATIONS.DELETE_CONFIRM', {
  //       Default: 'Confirm to delete the org from server?'
  //     })
  //   )
  //   const confirm = await firstValueFrom(
  //     this._dialog
  //       .open(ConfirmDeleteComponent, {
  //         data: {
  //           value: organization?.name,
  //           information
  //         }
  //       })
  //       .afterClosed()
  //   )

  //   if (confirm) {
  //     try {
  //       await firstValueFrom(this.organizationsService.delete(organization.id))
  //       this._toastrService.success('PAC.NOTES.ORGANIZATIONS.DELETE_ORGANIZATION', {
  //         Default: `Organization '{{ name }}' was removed`,
  //         name: organization.name
  //       })
  //       this.refresh$.next()
  //     } catch (err) {
  //       this._toastrService.error(err)
  //     }
  //   }
  // }
}
