import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'

import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PlaceholderAddComponent } from '@metad/story/story'
import { WidgetAnalyticalCardComponent } from './analytical-card.component'
import { AnalyticalChartPlaceholderComponent } from './chart-placeholder/chart-placeholder.component'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    AnalyticalCardModule,
    MatMenuModule,
    ZardButtonComponent,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
    OcapCoreModule,
    NgmSelectionModule,
    
    PlaceholderAddComponent,
    AnalyticalChartPlaceholderComponent,
  ],
  declarations: [WidgetAnalyticalCardComponent],
  exports: [WidgetAnalyticalCardComponent]
})
export class WidgetAnalyticalCardModule {}
