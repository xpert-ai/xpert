import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'

import { NgmFormlyRadioComponent } from './radio.type'

@NgModule({
  imports: [
    NgmFormlyRadioComponent,
    FormlyModule.forChild({
      types: [
        {
          name: 'radio',
          component: NgmFormlyRadioComponent
        }
      ]
    })
  ],
  exports: [NgmFormlyRadioComponent]
})
export class NgmFormlyRadioModule {}
