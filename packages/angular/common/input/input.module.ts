import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgmInputComponent, NgmOptionContent } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  declarations: [],
  imports: [CommonModule, NgmOptionContent, NgmInputComponent],
  exports: [NgmOptionContent, NgmInputComponent]
})
export class NgmInputModule {}
