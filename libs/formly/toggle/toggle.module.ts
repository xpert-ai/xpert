import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { FormlyModule } from '@ngx-formly/core'
import { ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { XpFormlyToggleComponent } from './toggle.type'

@NgModule({
  declarations: [XpFormlyToggleComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardSwitchComponent,
    FormlyModule.forChild({
      types: [
        {
          name: 'toggle',
          component: XpFormlyToggleComponent
        }
      ]
    })
  ]
})
export class XpFormlyToggleModule {}
