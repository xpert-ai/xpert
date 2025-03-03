import { NgModule } from '@angular/core'
import { MatBottomSheetModule } from '@angular/material/bottom-sheet'
import { FormlyModule } from '@ngx-formly/core'
import { FormlyMaterialModule } from '@ngx-formly/material'
import { ServerAgent } from '../@core'
import { OnboardingRoutingModule } from './onboarding-routing.module'

@NgModule({
  imports: [OnboardingRoutingModule, FormlyModule.forRoot(), FormlyMaterialModule, MatBottomSheetModule],
  declarations: [],
  providers: [ServerAgent]
})
export class OnboardingModule {}
