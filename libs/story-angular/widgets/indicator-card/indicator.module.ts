import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { TranslateModule } from '@ngx-translate/core'
import { PlaceholderAddComponent } from '@metad/story/story'
import { NgxEchartsModule } from 'ngx-echarts'
import { IndicatorCardComponent } from './indicator.component'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    ZardIconComponent,
    TranslateModule,
    NgxEchartsModule,
    PlaceholderAddComponent
  ],
  exports: [IndicatorCardComponent],
  declarations: [IndicatorCardComponent],
  providers: []
})
export class AccountingIndicatorCardModule {}
