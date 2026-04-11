import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { NgmColorsComponent } from '@xpert-ai/components/form-field'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmFormlyChartPropertyComponent } from './chart-property.component'
import { NgmChartPropertyComponent } from '../../chart-property/chart-property.component'
import { ZardButtonComponent, ZardCheckboxComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NgmFormlyChartPropertyComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardCheckboxComponent,
    TranslateModule,

    DensityDirective,
    NgmColorsComponent,
    NgmChartPropertyComponent,

    FormlyModule.forChild({
      types: [
        {
          name: 'chart-property',
          component: NgmFormlyChartPropertyComponent
        }
      ]
    })
  ],
  exports: [NgmFormlyChartPropertyComponent]
})
export class NgmFormlyChartPropertModule {}
