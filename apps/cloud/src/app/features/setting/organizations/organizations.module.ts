import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { OrganizationMembersComponent } from './organization-members/organization-members.component'
import { OrganizationsRoutingModule } from './organizations-routing.module'
import { XpTableComponent } from '@xpert-ai/headless-ui'
import { ZardSelectImports, ZardStepperImports } from '@xpert-ai/headless-ui'
import { OrgAvatarEditorComponent, OrgAvatarComponent } from '../../../@shared/organization'
import { TagMaintainComponent } from '../../../@shared/tag'

@NgModule({
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ...ZardSelectImports,
    ...ZardStepperImports,
    OrganizationsRoutingModule,
    OrganizationMembersComponent,
    OrgAvatarEditorComponent,
    OrgAvatarComponent,
    XpTableComponent,
    TagMaintainComponent
  ],
  declarations: [],
  providers: []
})
export class OrganizationsModule {}
