import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgmOptionContent } from './option-content'
import { NgmInputComponent } from './input.component'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  declarations: [],
  imports: [CommonModule, NgmOptionContent, NgmInputComponent],
  exports: [NgmOptionContent, NgmInputComponent]
})
export class NgmInputModule {}
