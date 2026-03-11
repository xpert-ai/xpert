import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'

import { FormlyModule } from '@ngx-formly/core'
import { MetadFormlyPanelComponent } from './panel.type'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [MetadFormlyPanelComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ZardIconComponent,
    ZardButtonComponent,
    FormlyModule.forChild({
      wrappers: [{ name: 'panel', component: MetadFormlyPanelComponent }]
    })
  ],
  exports: [MetadFormlyPanelComponent]
})
export class MetadFormlyPanelModule {}
