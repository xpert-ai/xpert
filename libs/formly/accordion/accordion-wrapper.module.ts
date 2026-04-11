import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import {
  ZardAccordionImports,
  ZardButtonComponent,
  ZardDividerComponent,
  ZardIconComponent,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { FormlyModule } from '@ngx-formly/core'
import { NgmDensityDirective } from '@xpert-ai/ocap-angular/core'
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
    ...ZardAccordionImports,
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
