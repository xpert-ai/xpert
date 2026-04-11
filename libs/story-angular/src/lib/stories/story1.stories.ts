import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DisplayDensity, NxCoreModule } from '@xpert-ai/core'
import { NxDSCoreModule, Sales, uuid } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { Meta, moduleMetadata, Story as StoryBook } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NxAnalyticsStoryModule } from '../analytics-story.module'
import { NxStoryDesignerComponent } from '../story/story.component'
import { NX_STORY_STORE, Story, WidgetComponentType } from '@xpert-ai/story/core'
import { StoryStoreMockService } from './story-store.service'

export default {
  title: 'Story/Story 1',
  component: NxStoryDesignerComponent,
  argTypes: {},
  decorators: [
    moduleMetadata({
      declarations: [],
      imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        LoggerModule.forRoot({
          level: NgxLoggerLevel.DEBUG,
        }),
        NxAnalyticsStoryModule.forRoot(),
        NxCoreModule.forRoot(),
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            type: 'Mock',
            uri: '',
            settings: {
              // entityTypes: {
              //   Sales: {
              //     entityType: Sales.SALES_ENTITY_TYPE,
              //     query: Sales.SALES_DATA,
              //   },
              // },
            },
          },
        }),
      ],
      providers: [
        {
          provide: NX_STORY_STORE,
          useClass: StoryStoreMockService
        }
      ],
    }),
  ],
} as Meta

const Template: StoryBook<NxStoryDesignerComponent> = (args: NxStoryDesignerComponent) => ({
  component: NxStoryDesignerComponent,
  props: args,
})

const story: Story = {
  name: '资产负债表',
  // dataSource: {
  //   type: 'Mock',
  //   uri: ''
  // },
  points: [
    {
      storyId: '资产负债表',
      type: 1,
      name: '资产负债表',
      widgets: [
        {
          key: uuid(),
          id: '资产负债表',
          storyId: '资产负债表',
          pointId: '资产负债表',
          name: '资产负债表',
          position: {
            x: 0, y: 0, rows: 10, cols: 20
          },
          component: WidgetComponentType.SmartGrid,
          title: '资产负债表',
          dataSettings: {
            dataSource: '',
            entitySet: 'Sales'
          },
          options: {
            displayDensity: DisplayDensity.compact,
            // allowFiltering: true,
            // filterMode: FilterMode.excelStyleFilter,
          }
        }
      ]
    }
  ]
}

export const 故事1 = (args: NxStoryDesignerComponent) => ({
  component: NxStoryDesignerComponent,
  props: {
    title: '资产负债表',
    story
  },
})
