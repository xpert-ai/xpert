import { NgModule } from '@angular/core'

import { SplitButtonComponent } from './split-button.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

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
