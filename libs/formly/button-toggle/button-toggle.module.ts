import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { OcapCoreModule } from '@metad/ocap-angular/core';
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardToggleGroupComponent, ZardToggleGroupItemComponent } from '@xpert-ai/headless-ui'
import { PACFormlyButtonToggleComponent } from './button-toggle.type';

@NgModule({
  declarations: [PACFormlyButtonToggleComponent],
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
          component: PACFormlyButtonToggleComponent,
        },
      ],
    }),
  ],
  exports: [PACFormlyButtonToggleComponent],
})
export class PACFormlyButtonToggleModule {}
