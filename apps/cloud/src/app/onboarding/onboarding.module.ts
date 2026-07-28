import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { XpFormlyModule } from '@xpert-ai/formly'
import { OnboardingRoutingModule } from './onboarding-routing.module'

@NgModule({
  imports: [OnboardingRoutingModule, FormlyModule.forRoot(), XpFormlyModule],
  declarations: []
})
export class OnboardingModule {}
