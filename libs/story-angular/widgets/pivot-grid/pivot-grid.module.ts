import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'
import { STORY_WIDGET_COMPONENT, WidgetComponentType } from '@metad/story/core'
import { NxComponentSettingsComponent, STORY_DESIGNER_COMPONENT } from '@metad/story/designer'
import {
  IgxGridModule, IgxTreeGridModule, IgxExcelExporterService, IgxGridResizingModule
} from 'igniteui-angular'
import { GridColumnSchema } from './grid-column.schema'
import { PACWidgetPivotGridComponent } from './pivot-grid.component'
import { PivotGridSchemaService } from './pivot-grid.schema'
import { WidgetDesignerType } from './types'

@NgModule({
  declarations: [PACWidgetPivotGridComponent],
  imports: [
    CommonModule,
    IgxGridModule,
    IgxTreeGridModule,
    IgxGridResizingModule
  ],
  exports: [
    PACWidgetPivotGridComponent
  ],
})
export class PivotGridModule {
  // static forRoot(): ModuleWithProviders<PivotGridModule> {
  //   return {
  //     ngModule: PivotGridModule,
  //     providers: [
  //       IgxExcelExporterService,
  //       {
  //         provide: STORY_WIDGET_COMPONENT,
  //         useValue: {
  //           type: WidgetComponentType.Table,
  //           component: PACWidgetPivotGridComponent,
  //           mapping: ['title', 'dataSettings', 'options', 'styling'],
  //           isCard: true
  //         },
  //         multi: true,
  //       },
  //       {
  //         provide: STORY_DESIGNER_COMPONENT,
  //         useValue: {
  //           type: WidgetComponentType.Table,
  //           component: NxComponentSettingsComponent,
  //           schema: PivotGridSchemaService,
  //         },
  //         multi: true,
  //       },
  //       {
  //         provide: STORY_DESIGNER_COMPONENT,
  //         useValue: {
  //           type: WidgetDesignerType.GridColumn,
  //           component: NxComponentSettingsComponent,
  //           schema: GridColumnSchema
  //         },
  //         multi: true
  //       }
  //     ],
  //   }
  // }
}
