import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { XpFormlyEmptyComponent } from './empty.type'

@NgModule({
  declarations: [XpFormlyEmptyComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'empty',
          component: XpFormlyEmptyComponent
        }
      ]
    })
  ]
})
export class XpFormlyEmptyModule {}
