import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { NxDSCoreModule, Sales } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { NxFormlyMemberSelectModule } from '../member-select/member-select.module'
import { NxFormlyFormPannelComponent } from './formly-form.component'

export default {
  title: 'Components/Formly/Member Select',
  component: NxFormlyFormPannelComponent,
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
          level: NgxLoggerLevel.DEBUG,
        }),
        NxFormlyMemberSelectModule,
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            type: 'Mock',
            uri: '',
            settings: {
              entityTypes: {
                MyEntity: {
                  entityType: Sales.SALES_ENTITY_TYPE
                },
              },
            },
          },
        }),
      ],
    }),
  ],
} as Meta

const Template: Story<NxFormlyFormPannelComponent> = (args: NxFormlyFormPannelComponent) => ({
  component: NxFormlyFormPannelComponent,
  props: args,
})

export const Primary = Template.bind({})
Primary.args = {
  fields: [{
    key: 'dimension',
    type: 'propertySelect',
    templateOptions: {
      label: 'Dimension',
      entityType: Sales.SALES_ENTITY_TYPE,
      showMeasures: true
    },
  }, {
    key: 'members',
    type: 'member-select',
    templateOptions: {
      label: 'Members'
    },
  }]
}
