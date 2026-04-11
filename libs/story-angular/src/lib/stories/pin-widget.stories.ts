import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DisplayDensity, NxCoreModule } from '@xpert-ai/core'
import { C_MEASURES, NxDSCoreModule, NxDSCoreService, Sales, uuid } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { NxSmartEChartsModule } from '@xpert-ai/smart-echarts'
import { Meta, moduleMetadata, Story as StoryBook } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NxAnalyticsStoryModule } from '../analytics-story.module'
import { PinWidgetComponent } from '../pin/pin-widget/pin-widget.component'
import { PinModule } from '../pin/pin.module'
import { NX_STORY_STORE, Story, WidgetComponentType } from '@xpert-ai/story/core'
import { StoryStoreMockService } from './story-store.service'

const DATASOURCE = '收入模型'
const STORY_ID = '收入指标库'

export default {
  title: 'Story/Pin Widget',
  component: PinWidgetComponent,
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
        NxSmartEChartsModule.forRoot(),
        PinModule,
        NxCoreModule.forRoot(),
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot(),
      ],
      providers: [
        NxDSCoreService,
        {
          provide: NX_STORY_STORE,
          useClass: StoryStoreMockService
        }
      ],
    }),
  ],
} as Meta

const Template: StoryBook<PinWidgetComponent> = (args: PinWidgetComponent) => ({
  component: PinWidgetComponent,
  props: args,
})

const story: Story = {
  id: STORY_ID,
  name: STORY_ID,
  model: {
    name: DATASOURCE,
    catalog: "$INFOCUBE",
    cube: "Sales",
    type: 'Mock',
    settings: {
      schema: {
        entitySets: {
          Sales: {
            name: 'Sales',
            entityType: Sales.SALES_ENTITY_TYPE,
            mock: {
              data: Sales.SALES_DATA,
            }
          }
        }
      }
    }
  },
  points: [
    {
      id: '资产负债表',
      type: 1,
      storyId: STORY_ID,
      name: '',
      widgets: [
        {
          key: uuid(),
          id: '资产负债表',
          storyId: STORY_ID,
          pointId: '资产负债表',
          name: '资产负债表',
          position: {
            x: 0,
            y: 0,
            rows: 10,
            cols: 20,
          },
          component: WidgetComponentType.SmartGrid,
          title: '资产负债表',
          dataSettings: {
            dataSource: DATASOURCE,
            entitySet: 'Sales',
            lineItemAnnotation: {
              dataFields: [{
                dimension: '[Department]'
              }]
            }
          },
          options: {
            displayDensity: DisplayDensity.compact,
            // allowFiltering: true,
            // filterMode: FilterMode.excelStyleFilter,
          },
        },
        {
          key: uuid(),
          id: '部门销售收入',
          storyId: STORY_ID,
          pointId: '资产负债表',
          name: '部门销售收入',
          position: {
            x: 0,
            y: 0,
            rows: 10,
            cols: 20,
          },
          component: WidgetComponentType.AnalyticalCard,
          title: '部门销售收入',
          dataSettings: {
            dataSource: DATASOURCE,
            entitySet: 'Sales',
            chartAnnotation: {
              chartType: 'Column',
              dimensions: [{
                dimension: '[Department]'
              }],
              measures: [{
                dimension: C_MEASURES,
                measure: 'ZAMOUNT'
              }]
            }
          },
          options: {
            displayDensity: DisplayDensity.compact,
          },
        },
      ],
    },
  ],
}

export const 故事1 = (args: PinWidgetComponent) => ({
  component: PinWidgetComponent,
  props: {
    title: '资产负债表',
    story,
    pointId: '资产负债表',
    widgetId: '资产负债表'
  },
})

export const 故事2 = (args: PinWidgetComponent) => ({
  component: PinWidgetComponent,
  props: {
    title: '资产负债表',
    story,
    pointId: '资产负债表',
    widgetId: '部门销售收入'
  }
})
