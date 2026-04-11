import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { ComponentCoreModule } from '@xpert-ai/components/core'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { NgmSelectionModule } from '@xpert-ai/ocap-angular/selection'
import { PlaceholderAddComponent } from '@xpert-ai/story/story'
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
