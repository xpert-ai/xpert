import type { Meta, StoryObj } from '@storybook/angular'

import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'

import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideOcapMock, provideTranslate } from '@metad/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import { NgmTimeFilterEditorComponent } from './time-filter-editor.component'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<NgmTimeFilterEditorComponent> = {
  title: 'Selection/TimeFilterEditor',
  component: NgmTimeFilterEditorComponent,
  excludeStories: /.*Data$/,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideOcapMock(), provideTranslate()]
    }),
    moduleMetadata({
      //👇 Imports both components to allow component composition with Storybook
      declarations: [],
      imports: []
    }),
    //👇 Wraps our stories with a decorator
    componentWrapperDecorator((story) => `<div style="margin: 3em">${story}</div>`)
  ],
  render: (args) => ({
    props: {
      ...args
    },
    template: `<ngm-time-filter-editor ${argsToTemplate(args)}></ngm-time-filter-editor>`
  })
}

export default meta
type Story = StoryObj<NgmTimeFilterEditorComponent>

export const Default: Story = {
  args: {
    entityType: null
  }
}
