import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'

import { MatMenuModule } from '@angular/material/menu'
import { AnalyticalGridModule } from '@metad/ocap-angular/analytical-grid'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { PlaceholderAddComponent } from '@metad/story/story'
import { TranslateModule } from '@ngx-translate/core'
import { WidgetAnalyticalGridComponent } from './analytical-grid.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    MatMenuModule,
    ZardButtonComponent,
    ZardIconComponent,
    TranslateModule,
    
    OcapCoreModule,
    AnalyticalGridModule,
    PlaceholderAddComponent,
    NgmSelectionModule,
  ],
  exports: [WidgetAnalyticalGridComponent],
  declarations: [WidgetAnalyticalGridComponent],
  providers: []
})
export class WidgetAnalyticalGridModule {
  static forRoot(): ModuleWithProviders<WidgetAnalyticalGridModule> {
    return {
      ngModule: WidgetAnalyticalGridModule,
      providers: [
      ]
    }
  }
}
