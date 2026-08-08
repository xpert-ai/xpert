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
import { XpDensityDirective } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { XpFormlyAccordionComponent } from './accordion-wrapper.component'

@NgModule({
  declarations: [XpFormlyAccordionComponent],
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
    XpDensityDirective,
    FormlyModule.forChild({
      types: [
        {
          name: 'accordion',
          component: XpFormlyAccordionComponent
        }
      ],
      wrappers: [
        {
          name: 'accordion',
          component: XpFormlyAccordionComponent
        }
      ]
    })
  ],
  exports: [XpFormlyAccordionComponent]
})
export class XpFormlyAccordionModule {}
