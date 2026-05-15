import { NgModule } from '@angular/core'
import { NgmCountdownModule as HeadlessNgmCountdownModule } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [HeadlessNgmCountdownModule],
  exports: [HeadlessNgmCountdownModule]
})
export class NgmCountdownModule {}
