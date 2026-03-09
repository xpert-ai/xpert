import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatRadioModule } from '@angular/material/radio'
import { NgmColorsComponent } from '@metad/components/form-field'
import { DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmFormlyChartPropertyComponent } from './chart-property.component'
import { NgmChartPropertyComponent } from '../../chart-property/chart-property.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NgmFormlyChartPropertyComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    MatIconModule,
    MatMenuModule,
    MatRadioModule,
    MatCheckboxModule,
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
