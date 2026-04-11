import { DragDropModule } from '@angular/cdk/drag-drop'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { FormlyModule } from '@ngx-formly/core'
import { FormlyFieldTextAreaComponent } from './textarea.type'

@NgModule({
  declarations: [FormlyFieldTextAreaComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DragDropModule,
    TextFieldModule,
    ZardInputDirective,
    ...ZardFormImports,

    FormlyModule.forChild({
      types: [
        {
          name: 'textarea',
          component: FormlyFieldTextAreaComponent
        }
      ]
    })
  ]
})
export class PACFormlyTextAreaModule {}
