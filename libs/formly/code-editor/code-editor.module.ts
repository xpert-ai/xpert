import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { AppearanceDirective } from '@xpert-ai/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { PACFormlyCodeEditorComponent } from './code-editor.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlyCodeEditorComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardIconComponent,
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
