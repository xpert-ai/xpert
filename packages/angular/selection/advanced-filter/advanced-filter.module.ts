import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule } from '@angular/material/dialog'
import { ZardButtonComponent, ZardFormImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { NgmSelectComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { NgmEntityModule } from '@metad/ocap-angular/entity'
import { TranslateModule } from '@ngx-translate/core'
import { NgmAdvancedFilterComponent } from './advanced-filter.component'

/**
 * "Advanced Filter" 同 "Combination Slicer"
 */
@NgModule({
  declarations: [NgmAdvancedFilterComponent],
  imports: [CommonModule, FormsModule, DragDropModule, MatDialogModule, ZardButtonComponent, ZardIconComponent, ...ZardFormImports, ZardInputDirective, MatChipsModule, TranslateModule, ButtonGroupDirective, DensityDirective, AppearanceDirective, NgmEntityModule, NgmSelectComponent],
  exports: [NgmAdvancedFilterComponent]
})
export class NgmAdvancedFilterModule {}
