import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDialogModule } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatMenuModule } from '@angular/material/menu'
import { MatSelectModule } from '@angular/material/select'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmCommonModule, ResizerModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { PACFormlyChartTypeComponent } from './chart-type.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlyChartTypeComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    MatIconModule,
    ZardButtonComponent,
    MatSelectModule,
    MatMenuModule,
    MatDialogModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MonacoEditorModule,
    TranslateModule,
    ButtonGroupDirective,
    DensityDirective,
    NgmCommonModule,
    ResizerModule,

    FormlyModule.forChild({
      types: [
        {
          name: 'chart-type',
          component: PACFormlyChartTypeComponent
        }
      ]
    })
  ],
  exports: [PACFormlyChartTypeComponent]
})
export class PACFormlyChartTypeModule {}
