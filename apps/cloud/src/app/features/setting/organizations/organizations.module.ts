import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { OrganizationMutationComponent } from './organization-mutation/organization-mutation.component'
import { OrganizationStepFormComponent } from './organization-step-form/organization-step-form.component'
import { OrganizationsRoutingModule } from './organizations-routing.module'
import { OrganizationsComponent } from './organizations.component'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { OrgAvatarEditorComponent, OrgAvatarComponent } from '../../../@shared/organization'
import { SharedModule } from '../../../@shared/shared.module'

@NgModule({
  imports: [
    SharedModule,
    FormsModule,
    ReactiveFormsModule,
    OrganizationsRoutingModule,
    OrgAvatarEditorComponent,
    OrgAvatarComponent,
    NgmTableComponent
  ],
  declarations: [
    OrganizationsComponent,
    OrganizationStepFormComponent,
    OrganizationMutationComponent,
  ],
  providers: []
})
export class OrganizationsModule {}
