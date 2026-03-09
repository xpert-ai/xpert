import type { Meta, StoryObj } from '@storybook/angular'
import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { CUBE_SALES_ORDER_NAME, MODEL_KEY, provideOcapMock, provideTranslate } from '@metad/ocap-angular/mock'
import { action } from '@storybook/addon-actions'
import { SlicersComponent } from './slicers.component'
import { NgmSelectionModule } from '../selection.module'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<SlicersComponent> = {
  title: 'Selection/Slicers',
  component: SlicersComponent,
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
    template: `<ngm-slicers ${argsToTemplate(args)}></ngm-slicers>`
  })
}

export default meta

type Story = StoryObj<SlicersComponent>

export const Default: Story = {
  args: {
    slicers: [
      {
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
    ]
  }
}

export const Editable: Story = {
  args: {
    editable: true,
    slicers: [
      {
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
    ],
    dataSettings: {
      dataSource: MODEL_KEY,
      entitySet: CUBE_SALES_ORDER_NAME
    }
  }
}
