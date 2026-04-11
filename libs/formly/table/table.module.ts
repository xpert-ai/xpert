import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { PACFormlyTableComponent } from './table.type'

@NgModule({
  declarations: [],
  imports: [
    CommonModule,

    FormlyModule.forChild({
      types: [
        {
          name: 'table',
          component: PACFormlyTableComponent
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
export class PACFormlyTableModule {}
