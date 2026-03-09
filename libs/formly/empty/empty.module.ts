import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { PACFormlyEmptyComponent } from './empty.type'

@NgModule({
  declarations: [PACFormlyEmptyComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'empty',
          component: PACFormlyEmptyComponent
        }
      ]
    })
  ]
})
export class PACFormlyEmptyModule {}
