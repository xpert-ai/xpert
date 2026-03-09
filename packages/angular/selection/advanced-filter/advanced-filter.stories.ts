import type { Meta, StoryObj } from '@storybook/angular'
import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideOcapMock, provideTranslate } from '@metad/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import { NgmAdvancedFilterComponent } from './advanced-filter.component'
import { NgmAdvancedFilterModule } from './advanced-filter.module'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<NgmAdvancedFilterComponent> = {
  title: 'Selection/AdvancedFilter',
  component: NgmAdvancedFilterComponent,
  excludeStories: /.*Data$/,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideOcapMock(), provideTranslate()]
    }),
    moduleMetadata({
      //👇 Imports both components to allow component composition with Storybook
      declarations: [],
      imports: [NgmAdvancedFilterModule]
    }),
    //👇 Wraps our stories with a decorator
    componentWrapperDecorator((story) => `<div style="margin: 3em">${story}</div>`)
  ],
  render: (args) => ({
    props: {
      ...args
    },
    template: `<ngm-advanced-filter ${argsToTemplate(args)}></ngm-advanced-filter>`
  })
}

export default meta
type Story = StoryObj<NgmAdvancedFilterComponent>

export const Default: Story = {
  args: {}
}
