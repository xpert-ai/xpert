import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { NgmEntityModule } from '@metad/ocap-angular/entity'
import { TranslateModule } from '@ngx-translate/core'
import { NgmAdvancedFilterComponent } from './advanced-filter.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

/**
 * "Advanced Filter" 同 "Combination Slicer"
 */
@NgModule({
  declarations: [NgmAdvancedFilterComponent],
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatDialogModule,
    ZardButtonComponent,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatChipsModule,
    TranslateModule,

    ButtonGroupDirective,
    DensityDirective,
    AppearanceDirective,

    NgmEntityModule
  ],
  exports: [NgmAdvancedFilterComponent]
})
export class NgmAdvancedFilterModule {}
