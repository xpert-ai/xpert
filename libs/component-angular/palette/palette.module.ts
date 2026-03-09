import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatDialogModule } from '@angular/material/dialog'
import { NxScaleChromaticComponent } from './scale-chromatic/scale-chromatic.component'
import { NxScaleChromaticDirective } from './scale-chromatic/scale-chromatic.directive'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [
    NxScaleChromaticDirective,
    NxScaleChromaticComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    MatDialogModule,
    ZardButtonComponent
  ],
  exports: [
    NxScaleChromaticDirective,
    NxScaleChromaticComponent,
  ]
})
export class NxPaletteModule {}
