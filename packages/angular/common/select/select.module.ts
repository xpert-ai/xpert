import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { NgmAdvancedSelectComponent, NgmOptionContent, NgmSelectComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [],
  imports: [CommonModule, NgmOptionContent, NgmSelectComponent, NgmAdvancedSelectComponent],
  exports: [NgmOptionContent, NgmSelectComponent, NgmAdvancedSelectComponent]
})
export class NgmSelectModule {}
