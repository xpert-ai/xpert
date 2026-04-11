import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { TreeTableComponent } from './tree-table.component'
import { ZardButtonComponent, ZardIconComponent, ZardTableImports } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [CommonModule, ...ZardTableImports, ZardButtonComponent, ZardIconComponent, OcapCoreModule],
  exports: [TreeTableComponent],
  declarations: [TreeTableComponent],
  providers: []
})
export class TreeTableModule {}
