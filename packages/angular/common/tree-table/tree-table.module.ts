import { NgModule } from '@angular/core'

import { TreeTableModule as HeadlessTreeTableModule } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [HeadlessTreeTableModule],
  exports: [HeadlessTreeTableModule]
})
export class TreeTableModule {}
