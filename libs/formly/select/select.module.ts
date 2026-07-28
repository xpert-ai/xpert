import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { XpFormlySelectComponent } from './select.type'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,

    FormlyModule.forChild({
      types: [
        {
          name: 'select-inline',
          component: XpFormlySelectComponent
        },
        {
          name: 'select',
          extends: 'select-inline'
        },
        {
          name: 'xp-select',
          extends: 'select',
          defaultOptions: {
            props: {
              virtualScroll: true
            }
          }
        }
      ]
    })
  ]
})
export class XpFormlySelectModule {}
