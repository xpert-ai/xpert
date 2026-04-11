import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { FormlyModule } from '@ngx-formly/core'
import { NxDSCoreModule, Sales } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NxFormlyFormModule, NxFormlyFormPannelComponent } from '../stories/formly-form.component'
import { PACFormlyChartTypeComponent } from './chart-type.component'
import { PACFormlyChartTypeModule } from './chart-type.module'

export default {
  title: 'Components/Formly/Chart Type',
  component: PACFormlyChartTypeComponent,
  argTypes: {
    selectedChange: { action: 'clicked' }
  },
  decorators: [
    moduleMetadata({
      declarations: [],
      imports: [
        BrowserAnimationsModule,
        HttpClientModule,
        LoggerModule.forRoot({
          level: NgxLoggerLevel.DEBUG
        }),
        FormlyModule.forRoot(),
        NxFormlyFormModule,
        PACFormlyChartTypeModule,
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            id: '',
            type: 'Mock',
            uri: '',
            settings: {
              entityTypes: {
                MyEntity: {
                  entityType: Sales.SALES_ENTITY_TYPE
                }
              }
            }
          }
        })
      ]
    })
  ]
} as Meta

const SCHEMA = [
  {
    key: 'chartType',
    type: 'chart-type',
    templateOptions: {
      label: '图形类型'
    }
  }
]

export const Primary: Story = () => ({})
Primary.parameters = {
  component: NxFormlyFormPannelComponent,
  props: {
    fields: SCHEMA,
    model: {}
  }
}
