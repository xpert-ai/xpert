import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { PlaceholderAddComponent } from '@metad/story/story'
import { NgxEchartsModule } from 'ngx-echarts'
import { IndicatorCardComponent } from './indicator.component'
import { ZardIconComponent, ZardLoaderComponent } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    ZardLoaderComponent,
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
