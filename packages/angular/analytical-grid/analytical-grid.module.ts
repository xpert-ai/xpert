import { A11yModule } from '@angular/cdk/a11y'
import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { MatCardModule } from '@angular/material/card'
import {
  ZardButtonComponent,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardCheckboxComponent
} from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatMenuModule } from '@angular/material/menu'
import { MatPaginatorModule } from '@angular/material/paginator'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSortModule } from '@angular/material/sort'
import { MatTableModule } from '@angular/material/table'
import { MatTooltipModule } from '@angular/material/tooltip'
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
    MatPaginatorModule,
    ZardButtonComponent,
    ZardIconComponent,
    MatMenuModule,
    MatProgressSpinnerModule,
    ZardDividerComponent,
    MatTooltipModule,
    MatSortModule,
    OverlayModule,
    MatCardModule,
    MatListModule,
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
