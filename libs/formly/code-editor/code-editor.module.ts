import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { XpAppearanceDirective } from '@xpert-ai/headless-ui'
import { FormlyModule } from '@ngx-formly/core'
import { XpFormlyCodeEditorComponent } from './code-editor.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [XpFormlyCodeEditorComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardButtonComponent,
    XpAppearanceDirective,

    FormlyModule.forChild({
      types: [
        {
          name: 'code-editor',
          component: XpFormlyCodeEditorComponent
        }
      ]
    })
  ],
  exports: [XpFormlyCodeEditorComponent]
})
export class XpFormlyCodeEditorModule {}
