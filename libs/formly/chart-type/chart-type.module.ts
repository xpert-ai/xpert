import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatMenuModule } from '@angular/material/menu'
import { NgmCommonModule, ResizerModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { ZardButtonComponent, ZardCheckboxComponent, ZardComboboxComponent, ZardDialogModule, ZardIconComponent, ZardInputDirective, ZardToggleGroupComponent, ZardToggleGroupItemComponent, ZardTooltipImports, provideZardIconAssets } from '@xpert-ai/headless-ui'
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
    ZardDialogModule,
    ZardInputDirective,
    ZardCheckboxComponent,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
    ...ZardTooltipImports,
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
