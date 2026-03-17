import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

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
  ZardChipsImports,
  ZardLoaderComponent,
  ZardMenuImports,
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
    ...ZardChipsImports,
    ...ZardMenuImports,
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
