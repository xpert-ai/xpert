import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { NgmSelectModule } from '@xpert-ai/ocap-angular/common'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { PACFormlySemanticModelComponent } from './semantic-model.type'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlySemanticModelComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardButtonComponent,
    TranslateModule,
    NgmSelectModule,
    OcapCoreModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'semantic-model',
          component: PACFormlySemanticModelComponent
        }
      ]
    })
  ],
  exports: [PACFormlySemanticModelComponent]
})
export class PACFormlySemanticModelModule {}
