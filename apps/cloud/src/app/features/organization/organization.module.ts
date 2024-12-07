import { NgModule } from '@angular/core'
import { OrganizationRoutingModule } from './organization-routing.module'
import { OrganizationComponent } from './organization.component'
import { MaterialModule } from '../../@shared/material.module'
import { SharedModule } from '../../@shared/shared.module'

@NgModule({
  declarations: [
    OrganizationComponent
  ],
  imports: [SharedModule, MaterialModule, OrganizationRoutingModule],
  providers: []
})
export class OrganizationModule {}
