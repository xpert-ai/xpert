import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatRadioModule } from '@angular/material/radio'
import { DensityDirective } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NxChromaticPreviewComponent } from '@metad/components/palette'
import { NgmEntityModule, PropertyCapacity } from '@metad/ocap-angular/entity'
import { NgmColorsComponent } from '@metad/components/form-field'
import { PACFormlyPropertySelectComponent } from './property-select.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlyPropertySelectComponent],
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

    NgmEntityModule,
    NxChromaticPreviewComponent,
    DensityDirective,
    NgmColorsComponent,

    FormlyModule.forChild({
      types: [
        {
          name: 'property-select',
          component: PACFormlyPropertySelectComponent
        },
        {
          name: 'input-control',
          extends: 'property-select',
          defaultOptions: {
            props: {
              capacities: [PropertyCapacity.Dimension, PropertyCapacity.MeasureControl]
            }
          }
        }
      ]
    })
  ],
  exports: [PACFormlyPropertySelectComponent]
})
export class PACFormlyPropertySelectModule {}
