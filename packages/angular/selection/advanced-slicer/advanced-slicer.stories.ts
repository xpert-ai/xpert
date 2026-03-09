import type { Meta, StoryObj } from '@storybook/angular'
import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideOcapMock, provideTranslate } from '@metad/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import { NgmAdvancedSlicerComponent } from './advanced-slicer.component'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<NgmAdvancedSlicerComponent> = {
  title: 'Selection/AdvancedSlicer',
  component: NgmAdvancedSlicerComponent,
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
    template: `<ngm-advanced-slicer ${argsToTemplate(args)}></ngm-advanced-slicer>`
  })
}

export default meta
type Story = StoryObj<NgmAdvancedSlicerComponent>

export const Default: Story = {
  args: {}
}
