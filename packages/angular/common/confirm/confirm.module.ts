import { NgModule } from '@angular/core'

import { NgmConfirmModule as HeadlessNgmConfirmModule } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [HeadlessNgmConfirmModule],
  exports: [HeadlessNgmConfirmModule]
})
export class NgmConfirmModule {}
