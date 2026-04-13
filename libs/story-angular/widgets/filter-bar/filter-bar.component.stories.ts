import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { NxCoreModule } from '@xpert-ai/core'
import { NxDSCoreModule, Sales } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NxSmartFilterBarComponent } from './filter-bar.component'
import { NxWidgetFilterBarModule } from './filter-bar.module'

export default {
  title: 'Story/Widgets/Filter Bar',
  decorators: [
    moduleMetadata({
      declarations: [],
      imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        LoggerModule.forRoot({
          level: NgxLoggerLevel.DEBUG
        }),
        NxWidgetFilterBarModule,
        NxCoreModule.forRoot(),
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            type: 'Mock',
            uri: '',
            settings: {},
            schema: {
              entitySets: {
                Sales: {
                  name: 'Sales',
                  entityType: Sales.SALES_ENTITY_TYPE,
                  annotations: Sales.SALES_ANNOTATIONS,
                  mock: {
                    data: Sales.SALES_DATA,
                    members: {
                      '[Department]': Sales.SALES_DATA
                    }
                  }
                }
              }
            }
          }
        })
      ],
      providers: [
      ]
    })
  ],
  parameters: {
    docs: {
      description: {
        component: ``
      }
    }
  }
}

const Template: Story<NxSmartFilterBarComponent> = (args: NxSmartFilterBarComponent) => ({
  component: NxSmartFilterBarComponent,
  props: args
})

export const Primary = Template.bind({})
Primary.args = {
  dataSettings: {
    dataSource: '',
    entitySet: 'Sales',
    selectionFieldsAnnotation: {
      propertyPaths:[
        {
          dimension: '[Department]'
        },
        {
          dimension: '[Customers]'
        }
      ]
    }
  },
  options: {

  }
}
