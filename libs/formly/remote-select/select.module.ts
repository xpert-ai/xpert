import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { NgmFormlyRemoteSelectComponent } from './select.type'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,

    FormlyModule.forChild({
      types: [
        {
          name: 'remote-select',
          component: NgmFormlyRemoteSelectComponent
        }
      ]
    })
  ]
})
export class NgmFormlyRemoteSelectModule {}
