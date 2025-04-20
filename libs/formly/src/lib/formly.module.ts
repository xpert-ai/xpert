import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { NgmFormlyAccordionModule } from '@metad/formly/accordion'
import { NgmFormlyArrayModule } from '@metad/formly/array'
import { PACFormlyButtonToggleModule } from '@metad/formly/button-toggle'
import { PACFormlyChartTypeModule } from '@metad/formly/chart-type'
import { NgmFormlyMatCheckboxModule } from '@metad/formly/checkbox'
import { PACFormlyCodeEditorModule } from '@metad/formly/code-editor'
import { PACFormlyColorPickerModule } from '@metad/formly/color-picker'
import { PACFormlyDesignerModule } from '@metad/formly/designer'
import { PACFormlyEmptyModule } from '@metad/formly/empty'
import { PACFormlyEntityTypeModule } from '@metad/formly/entity-type'
import { PACFormlyInputModule } from '@metad/formly/input'
import { PACFormlyJsonModule } from '@metad/formly/json'
import { PACFormlyTableModule } from '@metad/formly/mat-table'
import { NgmFormlyMatToggleModule } from '@metad/formly/mat-toggle'
import { PACFormlySelectModule } from '@metad/formly/select'
import { PACFormlySemanticModelModule } from '@metad/formly/semantic-model'
import { PACFormlyMatSlicersModule } from '@metad/formly/slicers'
import { FormlyMatSliderModule } from '@metad/formly/slider'
import { PACFormlySortModule } from '@metad/formly/sort'
import { PACFormlyTextAreaModule } from '@metad/formly/textarea'
import { MetadFormlyPanelModule } from '@metad/formly/panel'
import { NgmFormlyRemoteSelectModule } from '@metad/formly/remote-select'
import { HLFormlyTabsModule } from '@metad/formly/hl-tabs'

@NgModule({
  declarations: [],
  imports: [CommonModule],
  exports: [
    PACFormlyJsonModule,
    NgmFormlyMatToggleModule,
    FormlyMatSliderModule,
    PACFormlyChartTypeModule,
    PACFormlyMatSlicersModule,
    PACFormlyCodeEditorModule,
    PACFormlyDesignerModule,
    PACFormlyEmptyModule,
    PACFormlyButtonToggleModule,
    PACFormlyTableModule,
    PACFormlyInputModule,
    PACFormlySelectModule,
    NgmFormlyMatCheckboxModule,
    PACFormlyTextAreaModule,
    PACFormlySemanticModelModule,
    PACFormlySortModule,
    PACFormlyColorPickerModule,
    PACFormlyEntityTypeModule,
    MetadFormlyPanelModule,

    NgmFormlyArrayModule,
    NgmFormlyAccordionModule,
    NgmFormlyRemoteSelectModule,
    HLFormlyTabsModule
  ]
})
export class NgmFormlyModule {}
