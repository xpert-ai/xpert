import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { MatTableModule } from '@angular/material/table'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TreeTableComponent } from './tree-table.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [CommonModule, MatTableModule, ZardButtonComponent, ZardIconComponent, OcapCoreModule],
  exports: [TreeTableComponent],
  declarations: [TreeTableComponent],
  providers: []
})
export class TreeTableModule {}
