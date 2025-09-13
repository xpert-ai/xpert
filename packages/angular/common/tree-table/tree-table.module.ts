import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatTableModule } from '@angular/material/table'
import { OcapCoreModule } from '@metad/ocap-angular/core'

import { TreeTableComponent } from './tree-table.component'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [CommonModule, MatTableModule, MatButtonModule, MatIconModule, OcapCoreModule],
  exports: [TreeTableComponent],
  declarations: [TreeTableComponent],
  providers: []
})
export class TreeTableModule {}
