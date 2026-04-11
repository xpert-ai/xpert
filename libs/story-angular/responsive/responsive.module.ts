import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { NxFlexLayoutComponent } from './flex-layout/flex-layout.component'
import { ZardButtonComponent, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [
    NxFlexLayoutComponent
  ],
  imports: [
    CommonModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardMenuImports,
  ],
  exports: [
    NxFlexLayoutComponent
  ],
})
export class NxStoryResponsiveModule {}
