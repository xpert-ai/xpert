import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgmSelectComponent } from './select/select.component'
import { NgmOptionContent } from '../input/option-content'
import { NgmAdvancedSelectComponent } from './advanced/select.component'

@NgModule({
  declarations: [],
  imports: [CommonModule, NgmOptionContent, NgmSelectComponent, NgmAdvancedSelectComponent],
  exports: [NgmOptionContent, NgmSelectComponent, NgmAdvancedSelectComponent]
})
export class NgmSelectModule {}
