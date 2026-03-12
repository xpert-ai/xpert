import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatMenuModule } from '@angular/material/menu'
import { MatSidenavModule } from '@angular/material/sidenav'
import { ResizerModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgmBaseEditorDirective } from './editor.directive'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatMenuModule,
    MatSidenavModule,
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
