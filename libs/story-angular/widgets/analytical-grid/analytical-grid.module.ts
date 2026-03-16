import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'

import { AnalyticalGridModule } from '@metad/ocap-angular/analytical-grid'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { NgmSelectionModule } from '@metad/ocap-angular/selection'
import { PlaceholderAddComponent } from '@metad/story/story'
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
