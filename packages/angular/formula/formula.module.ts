import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ResizerModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgmBaseEditorDirective } from './editor.directive'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatMenuModule,
    MatSidenavModule,
    MatIconModule,
    ZardButtonComponent,
    MatTooltipModule,
    TranslateModule,
    
    MonacoEditorModule,

    OcapCoreModule,
    ResizerModule,
  ],
  exports: [NgmBaseEditorDirective],
  declarations: [NgmBaseEditorDirective],
  providers: []
})
export class NgmFormulaModule {}
