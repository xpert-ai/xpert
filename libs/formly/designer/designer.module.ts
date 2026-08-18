import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpFormlyDesignerComponent } from './designer.type'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [XpFormlyDesignerComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,

    TranslateModule,

    FormlyModule.forChild({
      types: [
        {
          name: 'designer',
          component: XpFormlyDesignerComponent
        }
      ]
    })
  ]
})
export class XpFormlyDesignerModule {}
