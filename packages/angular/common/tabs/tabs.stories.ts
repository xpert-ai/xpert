import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardMenuImports,
  ZardTabGroupComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'

export default {
  title: 'Common/ZardTabs',
  component: ZardTabGroupComponent,
  decorators: [
    moduleMetadata({
      imports: [BrowserAnimationsModule, ZardButtonComponent, ...ZardMenuImports, ZardIconComponent, ...ZardTabsImports, OcapCoreModule]
    })
  ]
} as Meta<ZardTabGroupComponent>

type Story = StoryObj<ZardTabGroupComponent>

export const Primary: Story = {
  args: {
  },
};

export const CloseButton = ((args: any) => ({
  props: args,
  template: `
<z-tab-group class="ngm-appearance-desktop" disableRipple>
  <z-tab label="First">
    <ng-template zTabLabel>First
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy" class="ngm-appearance-desktop ngm-tab-button-right" z-menu [zMenuTriggerFor]="pointMenu" [zMenuTriggerData]="{point: point}" zPlacement="leftTop">
          <z-icon zType="more_vert"></z-icon>
      </button>
    </ng-template>
   Content 1 </z-tab>
  <z-tab label="Second"> Content 2 </z-tab>
  <z-tab label="Third"> Content 3 </z-tab>
</z-tab-group>
<ng-template #pointMenu>
  <div z-menu-content>
    <button type="button" z-menu-item>Item 1</button>
    <button type="button" z-menu-item>Item 2</button>
  </div>
</ng-template>
  `,
  styles: [``]
})).bind({})
