import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { EmailInviteFormComponent } from './email-invite-form/email-invite-form.component'
import { SharedModule } from '../../shared.module'
import { TranslateModule } from '@ngx-translate/core'
import { FormFieldEmailsComponent } from '../../form-fields'
import { RoleFormFieldComponent } from '../../user/forms/fields/role'
import { NgmSelectComponent } from '@xpert-ai/ocap-angular/common'

@NgModule({
  imports: [
    FormsModule,
    ReactiveFormsModule,

    TranslateModule,
    SharedModule,
    FormFieldEmailsComponent,
    RoleFormFieldComponent,
    NgmSelectComponent
  ],
  exports: [EmailInviteFormComponent],
  declarations: [EmailInviteFormComponent]
})
export class InviteFormsModule {}
