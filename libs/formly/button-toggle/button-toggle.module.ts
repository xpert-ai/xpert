import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import { OcapCoreModule } from '@metad/ocap-angular/core';
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { PACFormlyButtonToggleComponent } from './button-toggle.type';

@NgModule({
  declarations: [PACFormlyButtonToggleComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonToggleModule,
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
