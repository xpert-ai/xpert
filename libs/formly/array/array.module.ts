import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { XpAppearanceDirective, DensityDirective } from '@xpert-ai/headless-ui'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpFormlyArrayComponent } from './array.type'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@NgModule({
  declarations: [XpFormlyArrayComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardButtonComponent,
    ...ZardTooltipImports,
    TranslateModule,
    XpAppearanceDirective,
    DensityDirective,

    FormlyModule.forChild({
      types: [
        {
          name: 'array',
          component: XpFormlyArrayComponent
        }
      ]
    })
  ],
  exports: [XpFormlyArrayComponent]
})
export class XpFormlyArrayModule {}
