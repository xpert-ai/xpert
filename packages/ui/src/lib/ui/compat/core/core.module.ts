import { NgModule } from '@angular/core'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from './directives'

@NgModule({
  imports: [DensityDirective, AppearanceDirective, ButtonGroupDirective],
  exports: [DensityDirective, AppearanceDirective, ButtonGroupDirective],
  declarations: [],
  providers: []
})
export class OcapCoreModule {}
