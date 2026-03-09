import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { PACFormlyDesignerComponent } from './designer.type'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlyDesignerComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,

    TranslateModule,
    AppearanceDirective,
    DensityDirective,
    
    FormlyModule.forChild({
      types: [
        {
          name: 'designer',
          component: PACFormlyDesignerComponent
        }
      ]
    })
  ]
})
export class PACFormlyDesignerModule {}
