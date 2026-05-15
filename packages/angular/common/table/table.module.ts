import { NgModule } from '@angular/core'
import { TableVirtualScrollModule as HeadlessTableVirtualScrollModule } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [HeadlessTableVirtualScrollModule],
  exports: [HeadlessTableVirtualScrollModule]
})
export class TableVirtualScrollModule {}
