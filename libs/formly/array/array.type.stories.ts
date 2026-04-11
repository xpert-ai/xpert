import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { FormlyModule } from '@ngx-formly/core'
import { NxDSCoreModule, Sales } from '@xpert-ai/ds-core'
import { NxDSMockModule } from '@xpert-ai/ds-mock'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { PACFormlyCodeEditorComponent, PACFormlyCodeEditorModule } from '../code-editor/public-api'

export default {
  title: 'Components/Formly/Code Editor',
  component: PACFormlyCodeEditorComponent,
  argTypes: {
    selectedChange: { action: 'clicked' },
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
        FormlyModule.forRoot(),
        PACFormlyCodeEditorModule,
        NxDSCoreModule.forRoot(),
        NxDSMockModule.forRoot({
          '': {
            id: '',
            type: 'Mock',
            uri: '',
            settings: {
              entityTypes: {
                MyEntity: {
                  entityType: Sales.SALES_ENTITY_TYPE,
                },
              },
            },
          },
        }),
      ],
    }),
  ],
} as Meta

const Template: Story<PACFormlyCodeEditorComponent> = (args: PACFormlyCodeEditorComponent) => ({
  component: PACFormlyCodeEditorComponent,
  props: args,
})

export const Primary = Template.bind(
  {
    options: {
      
    }
  }
)
