import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { NxFlexLayoutComponent } from './flex-layout/flex-layout.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [
    NxFlexLayoutComponent
  ],
  imports: [
    CommonModule,
    ZardButtonComponent,
    MatIconModule,
    MatMenuModule,
  ],
  exports: [
    NxFlexLayoutComponent
  ],
})
export class NxStoryResponsiveModule {}
