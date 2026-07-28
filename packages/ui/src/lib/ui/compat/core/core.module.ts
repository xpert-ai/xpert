import { NgModule } from '@angular/core'
import { XpAppearanceDirective, XpButtonGroupDirective, DensityDirective } from './directives'

@NgModule({
  imports: [DensityDirective, XpAppearanceDirective, XpButtonGroupDirective],
  exports: [DensityDirective, XpAppearanceDirective, XpButtonGroupDirective],
  declarations: [],
  providers: []
})
export class OcapCoreModule {}
