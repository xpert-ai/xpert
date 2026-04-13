import { provideHttpClient } from '@angular/common/http'
import { importProvidersFrom } from '@angular/core'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideLogger, provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { Meta, StoryObj, applicationConfig, moduleMetadata } from '@storybook/angular'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { NgmCompareMemberSelectComponent } from './member-select.component'

const meta = {
  title: 'Entity/CompareMemberSelect',
  component: NgmCompareMemberSelectComponent,
  decorators: [
    applicationConfig({
      providers: [
        provideAnimations(),
        provideHttpClient(),
        provideTranslate(),
        provideLogger(),
        importProvidersFrom(MonacoEditorModule.forRoot())
      ]
    }),
    moduleMetadata({
      declarations: [],
      imports: [MonacoEditorModule]
    })
  ]
} as Meta

export default meta

type Story = StoryObj<NgmCompareMemberSelectComponent>

export const Primary: Story = {
  args: {
    label: 'Dimension',
    dimension: {
      dimension: '[Department]'
    }
  }
}

export const Calendar: Story = {
  args: {
    label: 'Dimension',
    dimension: {
      dimension: '[ZCALMONTH]'
    }
  }
}
