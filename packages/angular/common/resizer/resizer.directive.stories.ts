import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import { ZardCardImports, ZardDrawerImports } from '@xpert-ai/headless-ui'
import { ResizerBarDirective } from './resizer.directive'
import { ResizerModule } from './resizer.module'

export default {
  title: 'Common/ResizerBarDirective',
  component: ResizerBarDirective,
  decorators: [
    moduleMetadata({
      imports: [BrowserAnimationsModule, ...ZardDrawerImports, ...ZardCardImports, ResizerModule]
    })
  ],
  render: (args: Partial<ResizerBarDirective>) => ({
    props: {
      ...args,
    },
    template: `<z-drawer-container class="ngm-drawer-container">
    <z-drawer mode="side" [position]="drawerPosition" opened ngmResizer [resizerWidth]="200">Drawer content
      <div ngmResizerBar [resizerBarPosition]="barPosition" cdkDrag></div>
    </z-drawer>
    <z-drawer-content>Main content</z-drawer-content>
  </z-drawer-container>`,
  styles: [`z-drawer-container {
    height: 400px;
      }`]
  }),
} as Meta<ResizerBarDirective>

type Story = StoryObj<ResizerBarDirective>

export const Primary: Story = {
  args: {
    position: 'right'
  },
};

export const Left: Story = {
  args: {
    position: 'left'
  },
};

export const Top: Story = {
  args: {
    position: 'top'
  },
  render: (args: any) => ({
    template: `
    <z-card ngmResizer [resizerHeight]="200">
Simple card
  <div ngmResizerBar [resizerBarPosition]="barPosition" cdkDrag></div>
</z-card>`
  })
};

export const Bottom: Story = {
  args: {
    position: 'bottom'
  },
  render: (args: any) => ({
    template: `
    <z-card ngmResizer [resizerHeight]="200">
Simple card
  <div ngmResizerBar [resizerBarPosition]="barPosition" cdkDrag></div>
</z-card>`
  })
};
