import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NxChromaticPreviewComponent } from '@xpert-ai/components/palette'
import { NgmEntityModule, PropertyCapacity } from '@xpert-ai/ocap-angular/entity'
import { NgmColorsComponent } from '@xpert-ai/components/form-field'
import { PACFormlyPropertySelectComponent } from './property-select.component'
import { ZardButtonComponent, ZardCheckboxComponent, ZardFormImports, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlyPropertySelectComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardFormImports,
    ...ZardMenuImports,
    ZardCheckboxComponent,
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
