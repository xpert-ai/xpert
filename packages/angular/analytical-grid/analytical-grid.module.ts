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
  ZardTableImports,
  ZardMenuImports,
  ZardTooltipImports,
  ZardLoaderComponent
} from '@xpert-ai/headless-ui'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectionModule } from '@xpert-ai/ocap-angular/selection'
import { CdkMenuModule } from '@angular/cdk/menu'
import { AnalyticalGridComponent } from './analytical-grid.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    A11yModule,
    CdkMenuModule,
    ZardPaginatorComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTableImports,
    ...ZardMenuImports,
    ZardLoaderComponent,
    ZardDividerComponent,
    ...ZardTooltipImports,
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
