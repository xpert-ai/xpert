import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { NgmFormlyAccordionModule } from '@xpert-ai/formly/accordion'
import { NgmFormlyArrayModule } from '@xpert-ai/formly/array'
import { PACFormlyButtonToggleModule } from '@xpert-ai/formly/button-toggle'
import { NgmFormlyCheckboxModule } from '@xpert-ai/formly/checkbox'
import { PACFormlyCodeEditorModule } from '@xpert-ai/formly/code-editor'
import { PACFormlyColorPickerModule } from '@xpert-ai/formly/color-picker'
import { PACFormlyDesignerModule } from '@xpert-ai/formly/designer'
import { PACFormlyEmptyModule } from '@xpert-ai/formly/empty'
import { PACFormlyInputModule } from '@xpert-ai/formly/input'
import { PACFormlyJsonModule } from '@xpert-ai/formly/json'
import { PACFormlyTableModule } from '@xpert-ai/formly/table'
import { NgmFormlyToggleModule } from '@xpert-ai/formly/toggle'
import { PACFormlySelectModule } from '@xpert-ai/formly/select'
import { NgmFormlyRadioModule } from '@xpert-ai/formly/radio'
import { FormlySliderModule } from '@xpert-ai/formly/slider'
import { PACFormlyTextAreaModule } from '@xpert-ai/formly/textarea'
import { MetadFormlyPanelModule } from '@xpert-ai/formly/panel'
import { NgmFormlyRemoteSelectModule } from '@xpert-ai/formly/remote-select'
import { HLFormlyTabsModule } from '@xpert-ai/formly/hl-tabs'

@NgModule({
  declarations: [],
  imports: [CommonModule],
  exports: [
    PACFormlyJsonModule,
    NgmFormlyToggleModule,
    FormlySliderModule,
    PACFormlyCodeEditorModule,
    PACFormlyDesignerModule,
    PACFormlyEmptyModule,
    PACFormlyButtonToggleModule,
    PACFormlyTableModule,
    PACFormlyInputModule,
    PACFormlySelectModule,
    NgmFormlyRadioModule,
    NgmFormlyCheckboxModule,
    PACFormlyTextAreaModule,
    PACFormlyColorPickerModule,
    MetadFormlyPanelModule,

    NgmFormlyArrayModule,
    NgmFormlyAccordionModule,
    NgmFormlyRemoteSelectModule,
    HLFormlyTabsModule
  ]
})
export class NgmFormlyModule {}
