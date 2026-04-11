import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { uuid } from '@xpert-ai/ds-core'
import { Meta, moduleMetadata, Story } from '@storybook/angular'
import { NxFlexLayoutComponent } from './flex-layout/flex-layout.component'
import { NxStoryResponsiveModule } from './responsive.module'
import { ResponsiveService } from './responsive.service'
import { FlexItemType } from './types'

export default {
  title: 'Story/Responsive',
  component: NxFlexLayoutComponent,
  argTypes: {},
  decorators: [
    moduleMetadata({
      declarations: [],
      imports: [BrowserAnimationsModule, NxStoryResponsiveModule],
      providers: [ResponsiveService]
    }),
  ],
} as Meta

const Template: Story<NxFlexLayoutComponent> = args => ({
  props: {
    ...args,
  }
})

export const Horizontal = Template.bind({})
Horizontal.args = {
  editable: true,
  flexLayout: {
    id: uuid(),
    type: FlexItemType.FlexLayout,
    direction: 'row',

    children: [
      {
        id: uuid(),
        type: FlexItemType.FlexLayout,
        direction: 'row',
        styles: {
          flex: 1,
        }
      },
      {
        id: uuid(),
        type: FlexItemType.FlexLayout,
        direction: 'row',
        styles: {
          flex: 1,
        }
      }
    ]
  }
}

export const Vertical = Template.bind({})
Vertical.args = {
  editable: true,
  flexLayout: {
    id: uuid(),
    type: FlexItemType.FlexLayout,
    direction: 'column',

    children: [
      {
        id: uuid(),
        type: FlexItemType.FlexLayout,
        direction: 'row',
        styles: {
          flex: 1,
        }
      },
      {
        id: uuid(),
        type: FlexItemType.FlexLayout,
        direction: 'row',
        styles: {
          flex: 1,
        }
      }
    ]
  }
}
