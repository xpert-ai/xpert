import type { Meta, StoryObj } from '@storybook/angular'

import { applicationConfig, argsToTemplate, componentWrapperDecorator, moduleMetadata } from '@storybook/angular'

import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideOcapMock, provideTranslate } from '@metad/ocap-angular/mock'
import { FilterSelectionType, TimeGranularity } from '@metad/ocap-core'
import { action } from '@storybook/addon-actions'
import { NgmMemberDatepickerComponent } from './datepicker.component'
import { NgmMemberDatepickerModule } from './datepicker.module'
import { NgmYearpickerComponent } from './yearpicker/yearpicker.component'

export const actionsData = {
  onPinTask: action('onPinTask'),
  onArchiveTask: action('onArchiveTask')
}

const meta: Meta<NgmMemberDatepickerComponent> = {
  title: 'Selection/Datepicker',
  component: NgmMemberDatepickerComponent,
  excludeStories: /.*Data$/,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideOcapMock(), provideTranslate()]
    }),
    moduleMetadata({
      //👇 Imports both components to allow component composition with Storybook
      declarations: [],
      imports: [NgmMemberDatepickerModule, NgmYearpickerComponent]
    }),
    //👇 Wraps our stories with a decorator
    componentWrapperDecorator((story) => `<div style="margin: 3em">${story}</div>`)
  ],
  render: (args) => ({
    props: {
      ...args
    },
    template: `<ngm-member-datepicker ${argsToTemplate(args)}></ngm-member-datepicker>`
  })
}

export default meta

type Story = StoryObj<NgmMemberDatepickerComponent>

export const Default: Story = {
  args: {}
}

type YearStory = StoryObj<NgmYearpickerComponent>
export const YearPicker: YearStory = {
  args: {
    label: 'Year Picker',
  },
  render: (args) => ({
    props: {
      ...args
    },
    template: `<ngm-yearpicker ${argsToTemplate(args)}></ngm-yearpicker>`
  })
}

export const Year: Story = {
  args: {
    granularity: TimeGranularity.Year
  }
}

export const Quarter: Story = {
  args: {
    granularity: TimeGranularity.Quarter
  }
}

export const Month: Story = {
  args: {
    granularity: TimeGranularity.Month
  }
}

export const Day: Story = {
  args: {
    granularity: TimeGranularity.Day
  }
}

export const DefaultValue: Story = {
  args: {
    granularity: TimeGranularity.Week,
    defaultValue: '2021-01-01'
  }
}

export const Year_to_Today: Story = {
  args: {
    selectionType: FilterSelectionType.SingleRange,
    granularity: TimeGranularity.Month,
    defaultValue: 'YEAR_TO_TODAY'
  }
}
