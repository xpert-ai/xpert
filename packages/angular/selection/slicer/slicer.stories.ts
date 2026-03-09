import type { Meta, StoryObj } from '@storybook/angular'
import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { CUBE_SALES_ORDER_NAME, MODEL_KEY, provideOcapMock, provideTranslate } from '@metad/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import { SlicerComponent } from './slicer.component'
import { NgmSelectionModule } from '../selection.module'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<SlicerComponent> = {
  title: 'Selection/Slicer',
  component: SlicerComponent,
  excludeStories: /.*Data$/,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideOcapMock(), provideTranslate()]
    }),
    moduleMetadata({
      //👇 Imports both components to allow component composition with Storybook
      declarations: [],
      imports: [NgmSelectionModule]
    }),
    //👇 Wraps our stories with a decorator
    componentWrapperDecorator((story) => `<div style="margin: 3em">${story}</div>`)
  ],
  render: (args) => ({
    props: {
      ...args
    },
    template: `<ngm-slicer ${argsToTemplate(args)}></ngm-slicer>`
  })
}

export default meta

type Story = StoryObj<SlicerComponent>

export const Default: Story = {
  args: {
    slicer: {
      dimension: {
        dimension: 'A',
      },
      members: [
        {
          key: '1',
          caption: 'A',
        },
        {
          key: '2',
          caption: 'B',
        }
      ]
    }
  }
}

export const Editable: Story = {
  args: {
    editable: true,
    slicer: {
      dimension: {
        dimension: 'A',
      },
      members: [
        {
          key: '1',
          caption: 'A',
        },
        {
          key: '2',
          caption: 'B',
        }
      ]
    },
    dataSettings: {
      dataSource: MODEL_KEY,
      entitySet: CUBE_SALES_ORDER_NAME
    }
  }
}
