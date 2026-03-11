import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmFormlyArrayComponent } from './array.type'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NgmFormlyArrayComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardButtonComponent,
    MatTooltipModule,
    TranslateModule,
    AppearanceDirective,
    DensityDirective,

    FormlyModule.forChild({
      types: [
        {
          name: 'array',
          component: NgmFormlyArrayComponent,
        },
      ],
    }),
  ],
  exports: [NgmFormlyArrayComponent],
})
export class NgmFormlyArrayModule {}
