import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { OcapCoreModule } from '@xpert-ai/headless-ui'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardToggleGroupComponent, ZardToggleGroupItemComponent } from '@xpert-ai/headless-ui'
import { XpFormlyButtonToggleComponent } from './button-toggle.type'

@NgModule({
  declarations: [XpFormlyButtonToggleComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
    TranslateModule,
    OcapCoreModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'button-toggle',
          component: XpFormlyButtonToggleComponent
        }
      ]
    })
  ],
  exports: [XpFormlyButtonToggleComponent]
})
export class XpFormlyButtonToggleModule {}
