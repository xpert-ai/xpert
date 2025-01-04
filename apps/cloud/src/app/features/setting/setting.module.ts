import { NgModule } from '@angular/core'
import { provideFormlyMaterial } from '@metad/formly'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { InviteMutationComponent } from '../../@shared/invite'
import { UserFormsModule } from '../../@shared/user/forms'
import { SettingRoutingModule } from './setting-routing.module'
import { PACSettingComponent } from './settings.component'
import { UserModule } from './users/user.module'
import { MaterialModule } from '../../@shared/material.module'
import { SharedModule } from '../../@shared/shared.module'

@NgModule({
  declarations: [PACSettingComponent],
  imports: [
    SharedModule,
    MaterialModule,
    SettingRoutingModule,

    UserModule,
    UserFormsModule,
    ButtonGroupDirective,
    NgmCommonModule,

    InviteMutationComponent
  ],
  providers: [provideFormlyMaterial()]
})
export class SettingModule {}
