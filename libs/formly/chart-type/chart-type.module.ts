import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDialogModule } from '@angular/material/dialog'
import { MatMenuModule } from '@angular/material/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmCommonModule, ResizerModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  provideZardIconAssets
} from '@xpert-ai/headless-ui'
import { PACFormlyChartTypeComponent } from './chart-type.component'
import { CHART_ICON_ASSETS } from './types'

@NgModule({
  declarations: [PACFormlyChartTypeComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    ZardIconComponent,
    ZardButtonComponent,
    ZardComboboxComponent,
    MatMenuModule,
    MatDialogModule,
    ZardInputDirective,
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
  providers: [provideZardIconAssets(CHART_ICON_ASSETS)],
  exports: [PACFormlyChartTypeComponent]
})
export class PACFormlyChartTypeModule {}
