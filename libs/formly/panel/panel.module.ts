import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { MatIconModule } from '@angular/material/icon'
import { FormlyModule } from '@ngx-formly/core'
import { MetadFormlyPanelComponent } from './panel.type'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [MetadFormlyPanelComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatIconModule,
    ZardButtonComponent,
    FormlyModule.forChild({
      wrappers: [{ name: 'panel', component: MetadFormlyPanelComponent }]
    })
  ],
  exports: [MetadFormlyPanelComponent]
})
export class MetadFormlyPanelModule {}
