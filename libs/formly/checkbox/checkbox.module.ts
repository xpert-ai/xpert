import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormlyModule } from '@ngx-formly/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { NgmFormlyCheckboxComponent } from './checkbox.type';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [NgmFormlyCheckboxComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,

    MatCheckboxModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'checkbox',
          component: NgmFormlyCheckboxComponent,
          // wrappers: ['form-field'],
        },
        {
          name: 'boolean',
          extends: 'checkbox',
        },
      ],
    }),
  ],
})
export class NgmFormlyMatCheckboxModule {}
