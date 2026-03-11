import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ReactiveFormsModule } from '@angular/forms'

import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule } from '@angular/material/dialog'
import { ZardDividerComponent } from '@xpert-ai/headless-ui'
import { MatIconModule } from '@angular/material/icon'
import { ZardInputDirective } from '@xpert-ai/headless-ui'
import { MatMenuModule } from '@angular/material/menu'
import { MatSelectModule } from '@angular/material/select'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmControlsModule } from '@metad/ocap-angular/controls'
import { ButtonGroupDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmEntityModule } from '@metad/ocap-angular/entity'
import { NgmParameterModule } from '@metad/ocap-angular/parameter'
import { TranslateModule } from '@ngx-translate/core'
import { NgmAdvancedSlicerComponent } from './advanced-slicer/advanced-slicer.component'
import { SlicerBarComponent } from './slicer-bar/slicer-bar.component'
import { SlicerComponent } from './slicer/slicer.component'
import { SlicersComponent } from './slicers/slicers.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [SlicerComponent, SlicersComponent, SlicerBarComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    MatDialogModule,
    MatIconModule,
    ZardButtonComponent,
    ZardInputDirective,
    MatChipsModule,
    MatSlideToggleModule,
    MatTooltipModule,
    ZardDividerComponent,
    MatMenuModule,
    MatSelectModule,
    TranslateModule,

    // OCAP Modules
    NgmControlsModule,
    OcapCoreModule,
    NgmCommonModule,
    ButtonGroupDirective,
    NgmParameterModule,
    NgmEntityModule,

    NgmAdvancedSlicerComponent
  ],
  exports: [SlicerComponent, SlicersComponent, SlicerBarComponent]
})
export class NgmSelectionModule {}
