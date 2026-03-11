import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { ZardDividerComponent } from '@xpert-ai/headless-ui';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormlyModule } from '@ngx-formly/core';
import { NgmDensityDirective } from '@metad/ocap-angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { NgmFormlyAccordionComponent } from './accordion-wrapper.component';
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NgmFormlyAccordionComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatIconModule,
    ZardButtonComponent,
    ZardDividerComponent,
    MatSlideToggleModule,
    MatExpansionModule,
    NgmDensityDirective,
    FormlyModule.forChild({
      types: [
        {
          name: 'accordion',
          component: NgmFormlyAccordionComponent,
        },
      ],
      wrappers: [
        {
          name: 'accordion',
          component: NgmFormlyAccordionComponent,
        },
      ],
    }),
  ],
  exports: [NgmFormlyAccordionComponent],
})
export class NgmFormlyAccordionModule {}
