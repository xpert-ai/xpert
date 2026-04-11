import { CommonModule } from '@angular/common'
import { ModuleWithProviders, NgModule } from '@angular/core'
import { NxCoreModule } from '@xpert-ai/core'
import { InputControlSchemaService } from '@xpert-ai/story/widgets/input-control'
import { STORY_WIDGET_COMPONENT } from '@xpert-ai/story/core'
import { NxComponentSettingsComponent, STORY_DESIGNER_COMPONENT } from '@xpert-ai/story/designer'
import { NgxEchartsModule } from 'ngx-echarts'
import { NxWidgetClockComponent } from './clock.component'

@NgModule({
  declarations: [NxWidgetClockComponent],
  imports: [CommonModule, NgxEchartsModule, NxCoreModule],
  exports: [NxWidgetClockComponent],
})
export class NxWidgetClockModule {
  static forRoot(): ModuleWithProviders<NxWidgetClockModule> {
    return {
      ngModule: NxWidgetClockModule,
      providers: [
        {
          provide: STORY_WIDGET_COMPONENT,
          useValue: {
            type: 'Clock',
            component: NxWidgetClockComponent,
            mapping: ['title', 'options'],
            menu: [
              {
                icon: 'edit',
                action: 'edit',
                label: 'Edit Input Control',
              },
            ],
            icon: 'schedule',
            label: '时钟',
            disableFab: true
          },
          multi: true,
        },
        {
          provide: STORY_DESIGNER_COMPONENT,
          useValue: {
            type: 'Clock',
            component: NxComponentSettingsComponent,
            schema: InputControlSchemaService,
          },
          multi: true,
        },
      ],
    }
  }
}
