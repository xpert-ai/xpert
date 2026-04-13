// Input.stories.ts

import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular'
import { NgmTableComponent } from './table.component'

const meta: Meta<NgmTableComponent> = {
  title: 'Common/Table',
  component: NgmTableComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideTranslate()]
    }),
    moduleMetadata({
      declarations: [],
      imports: [OcapCoreModule]
    })
  ]
}

export default meta
type Story = StoryObj<NgmTableComponent>

const columns = [{ name: 'name', caption: 'Name' }, { name: 'caption', caption: 'Caption' }, { name: 'type', caption: 'Type' }]
const data = [
  {
    name: 'name1',
    caption: 'caption1',
    type: 'type1'
  },
  {
    name: 'name2',
    caption: 'caption2',
    type: 'type2'
  },
  {
    name: 'name3',
    caption: 'caption3',
    type: 'type3'
  }
]

export const Primary: Story = {
  args: {
    columns,
    data
  }
}

export const Paginator: Story = {
  args: {
    columns,
    data,
    paging: true
  }
}