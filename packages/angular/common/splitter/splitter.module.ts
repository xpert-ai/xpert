import { NgModule } from '@angular/core'
import { SplitterModule as HeadlessSplitterModule } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [HeadlessSplitterModule],
  exports: [HeadlessSplitterModule]
})
export class SplitterModule {}
