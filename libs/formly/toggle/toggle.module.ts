import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { NgmFormlyToggleComponent } from './toggle.type'

@NgModule({
  declarations: [NgmFormlyToggleComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardSwitchComponent,
    FormlyModule.forChild({
      types: [
        {
          name: 'toggle',
          component: NgmFormlyToggleComponent
        }
      ]
    })
  ]
})
export class NgmFormlyToggleModule {}
