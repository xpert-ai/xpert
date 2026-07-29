import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'

import { XpFormlyRadioComponent } from './radio.type'

@NgModule({
  imports: [
    XpFormlyRadioComponent,
    FormlyModule.forChild({
      types: [
        {
          name: 'radio',
          component: XpFormlyRadioComponent
        }
      ]
    })
  ],
  exports: [XpFormlyRadioComponent]
})
export class XpFormlyRadioModule {}
