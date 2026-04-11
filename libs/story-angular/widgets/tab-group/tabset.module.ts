import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NxCoreModule } from '@xpert-ai/core'
import { STORY_WIDGET_COMPONENT } from '@xpert-ai/story/core'
import { NxComponentSettingsComponent, STORY_DESIGNER_COMPONENT } from '@xpert-ai/story/designer'
import { PlaceholderAddComponent } from '@xpert-ai/story/story'
import { WidgetAnalyticalCardModule } from '@xpert-ai/story/widgets//analytical-card'
import { WidgetAnalyticalGridModule } from '@xpert-ai/story/widgets/analytical-grid'
import { AccountingStatementModule } from '@xpert-ai/story/widgets/financial/accounting-statement'
import { AccountingIndicatorCardModule } from '@xpert-ai/story/widgets/indicator-card'
import { NxWidgetTabGroupComponent } from './tabset.component'
import { TabGroupSchemaService } from './tabset.schema'
import { ZardTabsImports } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NxWidgetTabGroupComponent],
  imports: [
    CommonModule,
    ...ZardTabsImports,
    TranslateModule,

    NxCoreModule,
    DensityDirective,
    PlaceholderAddComponent,

    AccountingStatementModule,
    AccountingIndicatorCardModule,
    WidgetAnalyticalCardModule,
    WidgetAnalyticalGridModule,
    
  ],
  exports: [NxWidgetTabGroupComponent]
})
export class NxWidgetTabGroupModule {
  static forRoot(): ModuleWithProviders<NxWidgetTabGroupModule> {
    return {
      ngModule: NxWidgetTabGroupModule,
      providers: [
        {
          provide: STORY_WIDGET_COMPONENT,
          useValue: {
            type: 'TabGroup',
            component: NxWidgetTabGroupComponent,
            mapping: ['title', 'options'],
            menu: [
              {
                icon: 'edit',
                action: 'edit',
                label: 'Edit Input Control'
              }
            ],
            icon: 'tab',
            label: 'Tab Group',
            category: 'card'
          },
          multi: true
        },
        {
          provide: STORY_DESIGNER_COMPONENT,
          useValue: {
            type: 'TabGroup',
            component: NxComponentSettingsComponent,
            schema: TabGroupSchemaService
          },
          multi: true
        }
      ]
    }
  }
}
