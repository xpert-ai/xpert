import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCardModule } from '@angular/material/card'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import { TranslateModule } from '@ngx-translate/core'
import { NgxEchartsModule } from 'ngx-echarts'
import { AnalyticalCardComponent } from './analytical-card.component'
import { CdkMenuModule } from '@angular/cdk/menu'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatButtonToggleModule,
    NgxEchartsModule,
    TranslateModule,
    NgmCommonModule,
    NgmEntityPropertyComponent,
    NgmSelectionModule,
    OcapCoreModule
  ],
  declarations: [AnalyticalCardComponent],
  exports: [AnalyticalCardComponent]
})
export class AnalyticalCardModule {}
