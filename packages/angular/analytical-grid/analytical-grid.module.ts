import { A11yModule } from '@angular/cdk/a11y'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import {
  ZardButtonComponent,
  ZardCardImports,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardPaginatorComponent,
  ZardCheckboxComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSortModule } from '@angular/material/sort'
import { MatTableModule } from '@angular/material/table'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { CdkMenuModule } from '@angular/cdk/menu'
import { AnalyticalGridComponent } from './analytical-grid.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    A11yModule,
    CdkMenuModule,
    MatTableModule,
    ZardPaginatorComponent,
    ZardButtonComponent,
    ZardIconComponent,
    MatMenuModule,
    MatProgressSpinnerModule,
    ZardDividerComponent,
    ...ZardTooltipImports,
    MatSortModule,
    OverlayModule,
    ...ZardCardImports,
    CdkListboxModule,
    ...ZardFormImports,
    ZardInputDirective,
    ZardCheckboxComponent,
    TranslateModule,
    OcapCoreModule,
    NgmCommonModule,
    NgmSelectionModule
  ],
  exports: [AnalyticalGridComponent],
  declarations: [AnalyticalGridComponent],
  providers: []
})
export class AnalyticalGridModule {}
