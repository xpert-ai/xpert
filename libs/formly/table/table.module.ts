import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { XpFormlyTableComponent } from './table.type'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,

    FormlyModule.forChild({
      types: [
        {
          name: 'table',
          component: XpFormlyTableComponent
        },
        {
          name: 'table-inline',
          extends: 'table',
          defaultOptions: {
            templateOptions: {
              type: 'inline'
            }
          }
        }
      ]
    })
  ]
})
export class XpFormlyTableModule {}
