import { NgModule } from '@angular/core'
import { OrganizationRoutingModule } from './organization-routing.module'
import { OrganizationComponent } from './organization.component'
import { SharedUiModule } from '../../@shared/ui.module'
import { SharedModule } from '../../@shared/shared.module'

@NgModule({
  declarations: [
    OrganizationComponent
  ],
  imports: [SharedModule, SharedUiModule, OrganizationRoutingModule],
  providers: []
})
export class OrganizationModule {}
