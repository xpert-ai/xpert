import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'
import { STORY_WIDGET_COMPONENT } from '@xpert-ai/story/core'
import { NxComponentSettingsComponent, STORY_DESIGNER_COMPONENT } from '@xpert-ai/story/designer'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import {
  IgxActionStripModule,
  IgxChipsModule,
  IgxComboModule,
  IgxDragDropModule,
  IgxGridModule,
  IgxInputGroupModule,
  IgxListModule,
  IgxProgressBarModule,
  IgxRippleModule,
  IgxSplitterModule,
  IgxTreeGridModule
} from 'igniteui-angular'
import { GridColumnSchema } from '@xpert-ai/story/widgets/pivot-grid'
import { ContextMenuComponent } from './context-menu/context-menu.component'
import { GridActionsModule } from './grid-actions/grid-actions.module'
import { SmartGridSearchBarComponent } from './search-bar/search-bar.component'
import { StoryWidgetSmartGridComponent } from './smart-grid.component'
import { SmartGridSettingsSchemaService } from './smart-grid.schema'
import { WidgetDesignerType } from './types'

const IGX_MODULES = [
  IgxGridModule,
  IgxTreeGridModule,
  IgxComboModule,
  IgxProgressBarModule,
  IgxSplitterModule,
  IgxDragDropModule,
  IgxListModule,
  IgxActionStripModule,
  IgxInputGroupModule,
  IgxRippleModule,
  IgxChipsModule
]

@NgModule({
  declarations: [StoryWidgetSmartGridComponent, SmartGridSearchBarComponent, ContextMenuComponent],
  imports: [CommonModule, ZardIconComponent, ...IGX_MODULES, GridActionsModule],
  exports: [StoryWidgetSmartGridComponent]
})
export class NxWidgetSmartGridModule {
  static forRoot(): ModuleWithProviders<NxWidgetSmartGridModule> {
    return {
      ngModule: NxWidgetSmartGridModule,
      providers: [
        {
          provide: STORY_WIDGET_COMPONENT,
          useValue: {
            type: WidgetDesignerType.SmartGrid,
            component: StoryWidgetSmartGridComponent,
            mapping: ['title', 'dataSettings', 'options'],
            menu: [
              {
                icon: 'edit',
                action: 'edit',
                label: 'Edit Input Control'
              }
            ],
            icon: 'view_agenda',
            label: '表格',
            isCard: true
          },
          multi: true
        },
        {
          provide: STORY_DESIGNER_COMPONENT,
          useValue: {
            type: WidgetDesignerType.SmartGrid,
            component: NxComponentSettingsComponent,
            schema: SmartGridSettingsSchemaService
          },
          multi: true
        },
        {
          provide: STORY_DESIGNER_COMPONENT,
          useValue: {
            type: WidgetDesignerType.SmartGridColumn,
            component: NxComponentSettingsComponent,
            schema: GridColumnSchema
          },
          multi: true
        }
      ]
    }
  }
}
