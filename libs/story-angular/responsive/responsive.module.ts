import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { MatMenuModule } from '@angular/material/menu'
import { NxFlexLayoutComponent } from './flex-layout/flex-layout.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [
    NxFlexLayoutComponent
  ],
  imports: [
    CommonModule,
    ZardButtonComponent,
    ZardIconComponent,
    MatMenuModule,
  ],
  exports: [
    NxFlexLayoutComponent
  ],
})
export class NxStoryResponsiveModule {}
