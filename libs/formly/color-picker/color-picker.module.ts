import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { XpFormlyColorPickerComponent } from './color-picker.component'

@NgModule({
  declarations: [],
  imports: [
    FormlyModule.forChild({
      types: [
        {
          name: 'color',
          component: XpFormlyColorPickerComponent,
          defaultOptions: {
            defaultValue: ''
          }
        }
      ]
    })
  ]
})
export class XpFormlyColorPickerModule {}
