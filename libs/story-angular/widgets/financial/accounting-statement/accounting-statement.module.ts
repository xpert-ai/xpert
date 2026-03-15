import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { MatChipsModule } from '@angular/material/chips'
import { MatMenuModule } from '@angular/material/menu'
import { ComponentCoreModule } from '@metad/components/core'
import { DensityDirective } from '@metad/ocap-angular/core'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { PlaceholderAddComponent } from '@metad/story/story'
import { TranslateModule } from '@ngx-translate/core'
import { AccountingStatementComponent } from './accounting-statement.component'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardCardImports,
  ZardLoaderComponent,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
@NgModule({
  imports: [
    CommonModule,
    TranslateModule,
    ...ZardCardImports,
    ZardButtonComponent,
    ZardIconComponent,
    MatMenuModule,
    MatChipsModule,
    ...ZardTooltipImports,
    ZardLoaderComponent,
    ...ZardTableImports,

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
