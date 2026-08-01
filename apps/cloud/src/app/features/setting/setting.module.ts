import { NgModule } from '@angular/core'
import { provideFormlyUi } from '@xpert-ai/formly'
import { XpCommonModule } from '@xpert-ai/headless-ui'
import { XpButtonGroupDirective } from '@xpert-ai/headless-ui'
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
    XpButtonGroupDirective,
    XpCommonModule,

    InviteMutationComponent
  ],
  providers: [provideFormlyUi()]
})
export class SettingModule {}
