import { NgModule } from '@angular/core'

import { SplitButtonComponent } from './split-button.component'
import { ZardButtonComponent } from '../../../components/button'
import { ZardIconComponent } from '../../../components/icon'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [ZardButtonComponent, ZardIconComponent],
  exports: [SplitButtonComponent],
  declarations: [SplitButtonComponent],
  providers: []
})
export class SplitButtonModule {}
