import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSelectionModule } from '@xpert-ai/ocap-angular/selection'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@xpert-ai/ocap-angular/entity'
import { TranslateModule } from '@ngx-translate/core'
import { NgxEchartsModule } from 'ngx-echarts'
import { AnalyticalCardComponent } from './analytical-card.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { 
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardToggleGroupComponent, 
  ZardToggleGroupItemComponent,
  ZardTooltipImports,
  ZardLoaderComponent
} from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    ...ZardCardImports,
    ZardButtonComponent,
    ZardIconComponent,
    ZardLoaderComponent,
     ...ZardTooltipImports,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent,
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
