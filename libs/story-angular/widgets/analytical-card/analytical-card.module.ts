import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { AnalyticalCardModule } from '@xpert-ai/ocap-angular/analytical-card'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PlaceholderAddComponent } from '@xpert-ai/story/story'
import { WidgetAnalyticalCardComponent } from './analytical-card.component'
import { AnalyticalChartPlaceholderComponent } from './chart-placeholder/chart-placeholder.component'
import { NgmSelectionModule } from '@xpert-ai/ocap-angular/selection'
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
