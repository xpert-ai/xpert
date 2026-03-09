import { NgModule } from '@angular/core'

import { MatIconModule } from '@angular/material/icon'
import { SplitButtonComponent } from './split-button.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [ZardButtonComponent, MatIconModule],
  exports: [SplitButtonComponent],
  declarations: [SplitButtonComponent],
  providers: []
})
export class SplitButtonModule {}
