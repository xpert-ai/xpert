import { Component, HostBinding, OnInit } from '@angular/core'
import { IOrganizationCreateInput } from 'apps/cloud/src/app/@core/types'

@Component({
  standalone: false,
  templateUrl: './organization-mutation.component.html',
  styleUrls: ['./organization-mutation.component.scss']
})
export class OrganizationMutationComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  organization = {} as IOrganizationCreateInput

  ngOnInit(): void {}

  onApply() {
    
  }
}
