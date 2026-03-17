import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { FormlyModule } from '@ngx-formly/core'
import { PACFormlySlicersComponent } from './slicers.type'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [PACFormlySlicersComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DragDropModule,
    ZardIconComponent,
    ZardButtonComponent,
    NgmSelectionModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'slicers',
          component: PACFormlySlicersComponent
        }
      ]
    })
  ],
  exports: [PACFormlySlicersComponent]
})
export class PACFormlySlicersModule {}
