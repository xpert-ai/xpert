import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ReactiveFormsModule } from '@angular/forms'

import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule } from '@angular/material/dialog'
import {
  ZardButtonComponent,
  ZardDividerComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { MatMenuModule } from '@angular/material/menu'
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

@NgModule({
  declarations: [SlicerComponent, SlicersComponent, SlicerBarComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    MatDialogModule,
    ZardIconComponent,
    ZardButtonComponent,
    ZardInputDirective,
    MatChipsModule,
    MatTooltipModule,
    ZardDividerComponent,
    MatMenuModule,
    TranslateModule,

    // OCAP Modules
    NgmControlsModule,
    OcapCoreModule,
    NgmCommonModule,
    ButtonGroupDirective,
    NgmParameterModule,
    NgmEntityModule,

    NgmAdvancedSlicerComponent,
    ZardSwitchComponent
  ],
  exports: [SlicerComponent, SlicersComponent, SlicerBarComponent]
})
export class NgmSelectionModule {}
