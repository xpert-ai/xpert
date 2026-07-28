import { HttpClientModule } from '@angular/common/http'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { FormlyModule } from '@ngx-formly/core'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger'
import { XpFormlyCodeEditorComponent, XpFormlyCodeEditorModule } from '../code-editor/public-api'

export default {
  title: 'Components/Formly/Code Editor',
  component: XpFormlyCodeEditorComponent,
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
        XpFormlyCodeEditorModule
      ]
    })
  ]
} as Meta

const Template: Story<XpFormlyCodeEditorComponent> = (args: XpFormlyCodeEditorComponent) => ({
  component: XpFormlyCodeEditorComponent,
  props: args
})

export const Primary = Template.bind({
  options: {}
})
