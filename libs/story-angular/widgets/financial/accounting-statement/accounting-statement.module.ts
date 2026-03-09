import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { MatCardModule } from '@angular/material/card'
import { MatChipsModule } from '@angular/material/chips'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTableModule } from '@angular/material/table'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ComponentCoreModule } from '@metad/components/core'
import { DensityDirective } from '@metad/ocap-angular/core'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { PlaceholderAddComponent } from '@metad/story/story'
import { TranslateModule } from '@ngx-translate/core'
import { AccountingStatementComponent } from './accounting-statement.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    TranslateModule,
    MatCardModule,
    ZardButtonComponent,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatTableModule,

    TranslateModule,

    NgmSelectionModule,
    ComponentCoreModule,
    PlaceholderAddComponent,
    DensityDirective
  ],
  exports: [AccountingStatementComponent],
  declarations: [AccountingStatementComponent],
  providers: []
})
export class AccountingStatementModule {}
