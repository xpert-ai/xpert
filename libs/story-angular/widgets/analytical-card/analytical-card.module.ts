import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PlaceholderAddComponent } from '@metad/story/story'
import { WidgetAnalyticalCardComponent } from './analytical-card.component'
import { AnalyticalChartPlaceholderComponent } from './chart-placeholder/chart-placeholder.component'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { ZardButtonComponent, ZardIconComponent, ZardMenuImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
@NgModule({
  imports: [
    CommonModule,
    AnalyticalCardModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardMenuImports,
    ...ZardTooltipImports,
    TranslateModule,
    OcapCoreModule,
    NgmSelectionModule,

    PlaceholderAddComponent,
    AnalyticalChartPlaceholderComponent
  ],
  declarations: [WidgetAnalyticalCardComponent],
  exports: [WidgetAnalyticalCardComponent]
})
export class WidgetAnalyticalCardModule {}
