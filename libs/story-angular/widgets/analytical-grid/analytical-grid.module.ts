import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'

import { AnalyticalGridModule } from '@xpert-ai/ocap-angular/analytical-grid'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { NgmSelectionModule } from '@xpert-ai/ocap-angular/selection'
import { PlaceholderAddComponent } from '@xpert-ai/story/story'
import { TranslateModule } from '@ngx-translate/core'
import { WidgetAnalyticalGridComponent } from './analytical-grid.component'
import { ZardButtonComponent, ZardIconComponent, ZardMenuImports } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [
    CommonModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardMenuImports,
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
