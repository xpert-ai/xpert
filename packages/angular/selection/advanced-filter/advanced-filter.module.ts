import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ZardButtonComponent, ZardChipsImports, ZardDialogModule, ZardFormImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { NgmSelectComponent } from '@xpert-ai/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { NgmEntityModule } from '@xpert-ai/ocap-angular/entity'
import { TranslateModule } from '@ngx-translate/core'
import { NgmAdvancedFilterComponent } from './advanced-filter.component'

/**
 * "Advanced Filter" 同 "Combination Slicer"
 */
@NgModule({
  declarations: [NgmAdvancedFilterComponent],
  imports: [CommonModule, FormsModule, DragDropModule, ZardDialogModule, ZardButtonComponent, ZardIconComponent, ...ZardFormImports, ZardInputDirective, ...ZardChipsImports, TranslateModule, ButtonGroupDirective, DensityDirective, AppearanceDirective, NgmEntityModule, NgmSelectComponent],
  exports: [NgmAdvancedFilterComponent]
})
export class NgmAdvancedFilterModule {}
