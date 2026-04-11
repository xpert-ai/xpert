import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { NgmFormlyModule } from '@xpert-ai/formly'
import { ServerAgent } from '../@core'
import { OnboardingRoutingModule } from './onboarding-routing.module'

@NgModule({
  imports: [OnboardingRoutingModule, FormlyModule.forRoot(), NgmFormlyModule],
  declarations: [],
  providers: [ServerAgent]
})
export class OnboardingModule {}
