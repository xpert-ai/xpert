import { NgModule } from '@angular/core'

import { SplitButtonModule as HeadlessSplitButtonModule } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [HeadlessSplitButtonModule],
  exports: [HeadlessSplitButtonModule]
})
export class SplitButtonModule {}
