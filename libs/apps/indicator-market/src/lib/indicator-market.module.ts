import { DragDropModule } from '@angular/cdk/drag-drop'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatBottomSheetModule } from '@angular/material/bottom-sheet'

import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCardModule } from '@angular/material/card'
import { MatChipsModule } from '@angular/material/chips'
import { MatRippleModule } from '@angular/material/core'
import { MatDatepickerModule } from '@angular/material/datepicker'
import {
  ZardButtonComponent,
  ZardDividerComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardCheckboxComponent
} from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatMenuModule } from '@angular/material/menu'
import { MatSliderModule } from '@angular/material/slider'
import { FavoritesService, IndicatorsService } from '@metad/cloud/state'
import { ReversePipe } from '@metad/core'
import { AnalyticalCardModule } from '@metad/ocap-angular/analytical-card'
import { NgmControlsModule } from '@metad/ocap-angular/controls'
import { AppearanceDirective, OcapCoreModule, provideOcapCore } from '@metad/ocap-angular/core'
import { NgmIndicatorComponent } from '@metad/ocap-angular/indicator'
import { TranslateModule } from '@ngx-translate/core'
import { NgxEchartsModule } from 'ngx-echarts'
import { LoggerModule } from 'ngx-logger'
import { MarkdownModule } from 'ngx-markdown'
import { IndicatorDetailComponent } from './indicator-detail/indicator-detail.component'
import { IndicatorItemComponent } from './indicator-item/indicator-item.component'
import { IndicatorMarketRoutingModule } from './indicator-market-routing.module'
import { IndicatoryMarketComponent } from './indicator-market.component'
import { PACIndicatorDirective } from './shared/indicator.directive'
import { ReplaceNullWithTextPipe } from './shared/replace-null-with-text.pipe'
import { AppSparkLineDirective } from './shared/sparkline.directive'
import { CdkMenuModule } from '@angular/cdk/menu'
import { MatTooltipModule } from '@angular/material/tooltip'

@NgModule({
  declarations: [
    AppSparkLineDirective,
    PACIndicatorDirective,
    IndicatoryMarketComponent,
    IndicatorItemComponent,
    IndicatorDetailComponent,
    ReplaceNullWithTextPipe
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IndicatorMarketRoutingModule,
    ScrollingModule,
    DragDropModule,
    CdkMenuModule,
    ZardDividerComponent,
    MatListModule,
    MatCardModule,
    ZardCheckboxComponent,
    ZardButtonComponent,
    ZardIconComponent,
    MatRippleModule,
    MatMenuModule,
    MatBottomSheetModule,
    MatButtonToggleModule,
    MatDatepickerModule,
    MatSliderModule,
    MatChipsModule,
    ZardInputDirective,
    MatTooltipModule,
    MarkdownModule,
    AppearanceDirective,
    ReversePipe,

    TranslateModule,

    // for DataSources
    OcapCoreModule,
    NgmControlsModule,
    NgmIndicatorComponent,

    // NxAnalyticsStoryModule,
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    AnalyticalCardModule,
    LoggerModule
  ],
  exports: [IndicatoryMarketComponent, IndicatorItemComponent, IndicatorDetailComponent],
  providers: [provideOcapCore(), IndicatorsService, FavoritesService]
})
export class IndicatorMarketModule {}
