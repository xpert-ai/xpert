import { NgModule } from '@angular/core'
import { FeaturesRoutingModule } from './features-routing.module'
import { PACFeaturesComponent } from './features.component'
import { SharedModule } from '../../../@shared/shared.module'

@NgModule({
  imports: [SharedModule, FeaturesRoutingModule],
  exports: [],
  declarations: [PACFeaturesComponent],
  providers: []
})
export class FeaturesModule {}
