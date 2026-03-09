import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatIconModule } from '@angular/material/icon'
import { AppearanceDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { PACFormlyCodeEditorComponent } from './code-editor.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlyCodeEditorComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    ZardButtonComponent,
    AppearanceDirective,
    
    FormlyModule.forChild({
      types: [
        {
          name: 'code-editor',
          component: PACFormlyCodeEditorComponent
        },
      ],
    }),
    
  ],
  exports: [PACFormlyCodeEditorComponent],
})
export class PACFormlyCodeEditorModule {}
