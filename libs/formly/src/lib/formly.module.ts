import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { XpFormlyAccordionModule } from '@xpert-ai/formly/accordion'
import { XpFormlyArrayModule } from '@xpert-ai/formly/array'
import { XpFormlyButtonToggleModule } from '@xpert-ai/formly/button-toggle'
import { XpFormlyCheckboxModule } from '@xpert-ai/formly/checkbox'
import { XpFormlyCodeEditorModule } from '@xpert-ai/formly/code-editor'
import { XpFormlyColorPickerModule } from '@xpert-ai/formly/color-picker'
import { XpFormlyDesignerModule } from '@xpert-ai/formly/designer'
import { XpFormlyEmptyModule } from '@xpert-ai/formly/empty'
import { XpFormlyInputModule } from '@xpert-ai/formly/input'
import { XpFormlyJsonModule } from '@xpert-ai/formly/json'
import { XpFormlyTableModule } from '@xpert-ai/formly/table'
import { XpFormlyToggleModule } from '@xpert-ai/formly/toggle'
import { XpFormlySelectModule } from '@xpert-ai/formly/select'
import { XpFormlyRadioModule } from '@xpert-ai/formly/radio'
import { FormlySliderModule } from '@xpert-ai/formly/slider'
import { XpFormlyTextAreaModule } from '@xpert-ai/formly/textarea'
import { MetadFormlyPanelModule } from '@xpert-ai/formly/panel'
import { XpFormlyRemoteSelectModule } from '@xpert-ai/formly/remote-select'
import { HLFormlyTabsModule } from '@xpert-ai/formly/hl-tabs'

@NgModule({
  declarations: [],
  imports: [CommonModule],
  exports: [
    XpFormlyJsonModule,
    XpFormlyToggleModule,
    FormlySliderModule,
    XpFormlyCodeEditorModule,
    XpFormlyDesignerModule,
    XpFormlyEmptyModule,
    XpFormlyButtonToggleModule,
    XpFormlyTableModule,
    XpFormlyInputModule,
    XpFormlySelectModule,
    XpFormlyRadioModule,
    XpFormlyCheckboxModule,
    XpFormlyTextAreaModule,
    XpFormlyColorPickerModule,
    MetadFormlyPanelModule,

    XpFormlyArrayModule,
    XpFormlyAccordionModule,
    XpFormlyRemoteSelectModule,
    HLFormlyTabsModule
  ]
})
export class XpFormlyModule {}
