import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ResizerModule } from '@xpert-ai/ocap-angular/common'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgmBaseEditorDirective } from './editor.directive'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardButtonComponent,
    ...ZardTooltipImports,
    TranslateModule,

    MonacoEditorModule,

    OcapCoreModule,
    ResizerModule
  ],
  exports: [NgmBaseEditorDirective],
  declarations: [NgmBaseEditorDirective],
  providers: []
})
export class NgmFormulaModule {}
