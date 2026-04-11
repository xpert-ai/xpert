import type { Meta, StoryObj } from '@storybook/angular'
import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { CUBE_SALES_ORDER_NAME, MODEL_KEY, provideOcapMock, provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import { NgmMeasureSelectComponent } from './measure-select.component'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<NgmMeasureSelectComponent> = {
  title: 'Entity/MeasureSelect',
  component: NgmMeasureSelectComponent,
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
    template: `<ngm-measure-select ${argsToTemplate(args)}></ngm-measure-select>`
  })
}

export default meta
type Story = StoryObj<NgmMeasureSelectComponent>

export const Default: Story = {
  args: {
    dataSettings: {
      dataSource: MODEL_KEY,
      entitySet: CUBE_SALES_ORDER_NAME
    }
  }
}
