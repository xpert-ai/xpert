import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { OrganizationsRoutingModule } from './organizations-routing.module'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { ZardStepperImports } from '@xpert-ai/headless-ui'
import { OrgAvatarEditorComponent, OrgAvatarComponent } from '../../../@shared/organization'
import { TagMaintainComponent } from '../../../@shared/tag'

@NgModule({
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ...ZardStepperImports,
    OrganizationsRoutingModule,
    OrgAvatarEditorComponent,
    OrgAvatarComponent,
    NgmTableComponent,
    TagMaintainComponent
  ],
  declarations: [
  ],
  providers: []
})
export class OrganizationsModule {}
