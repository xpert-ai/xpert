import { NgModule } from '@angular/core'
import { provideFormlyUi } from '@xpert-ai/formly'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { ButtonGroupDirective } from '@xpert-ai/ocap-angular/core'
import { InviteMutationComponent } from '../../@shared/invite'
import { UserFormsModule } from '../../@shared/user/forms'
import { SettingRoutingModule } from './setting-routing.module'
import { UserModule } from './users/user.module'

@NgModule({
  declarations: [],
  imports: [
    SettingRoutingModule,
    UserModule,
    UserFormsModule,
    ButtonGroupDirective,
    NgmCommonModule,

    InviteMutationComponent
  ],
  providers: [provideFormlyUi()]
})
export class SettingModule {}
