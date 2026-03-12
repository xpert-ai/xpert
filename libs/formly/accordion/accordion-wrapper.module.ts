import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import {
  ZardButtonComponent,
  ZardDividerComponent,
  ZardIconComponent,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { FormlyModule } from '@ngx-formly/core'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmFormlyAccordionComponent } from './accordion-wrapper.component'

@NgModule({
  declarations: [NgmFormlyAccordionComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardIconComponent,
    ZardButtonComponent,
    ZardDividerComponent,
    ZardSwitchComponent,
    MatExpansionModule,
    NgmDensityDirective,
    FormlyModule.forChild({
      types: [
        {
          name: 'accordion',
          component: NgmFormlyAccordionComponent
        }
      ],
      wrappers: [
        {
          name: 'accordion',
          component: NgmFormlyAccordionComponent
        }
      ]
    })
  ],
  exports: [NgmFormlyAccordionComponent]
})
export class NgmFormlyAccordionModule {}
