import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { DensityDirective } from '../core'
import { TreeTableComponent } from './tree-table.component'
import { ZardButtonComponent } from '../../../components/button'
import { ZardIconComponent } from '../../../components/icon'
import { ZardTableImports } from '../../../components/table'

/**
 * @deprecated use headless components instead
 */
@NgModule({
  imports: [CommonModule, ...ZardTableImports, ZardButtonComponent, ZardIconComponent, DensityDirective],
  exports: [TreeTableComponent],
  declarations: [TreeTableComponent],
  providers: []
})
export class TreeTableModule {}
