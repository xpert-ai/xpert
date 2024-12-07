import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { SharedModule } from '../../../../../@shared/shared.module'
import { EditOrganizationMainComponent } from './edit-organization-main/edit-organization-main.component'

@NgModule({
  imports: [SharedModule, CommonModule, FormlyModule],
  providers: [],
  declarations: [EditOrganizationMainComponent],
  exports: [EditOrganizationMainComponent]
})
export class EditOrganizationSettingsModule {}
