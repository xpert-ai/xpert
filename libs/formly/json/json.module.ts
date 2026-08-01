import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { TextFieldModule } from '@angular/cdk/text-field'
import { FormlyModule } from '@ngx-formly/core'
import { ReactiveFormsModule } from '@angular/forms'
import { XpFormlyJsonComponent } from './json.type'
import { ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [XpFormlyJsonComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TextFieldModule,
    ZardInputDirective,
    ...ZardFormImports,

    FormlyModule.forChild({
      types: [
        {
          name: 'json',
          component: XpFormlyJsonComponent
        }
      ]
    })
  ]
})
export class XpFormlyJsonModule {}
