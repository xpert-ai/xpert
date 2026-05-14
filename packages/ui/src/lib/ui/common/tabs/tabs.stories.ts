import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DensityDirective } from '../core'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import { ZardButtonComponent } from '../../../components/button'
import { ZardIconComponent } from '../../../components/icon'
import { ZardMenuImports } from '../../../components/menu'
import { ZardTabGroupComponent, ZardTabsImports } from '../../../components/tabs'

export default {
  title: 'Common/ZardTabs',
  component: ZardTabGroupComponent,
  decorators: [
    moduleMetadata({
      imports: [
        BrowserAnimationsModule,
        ZardButtonComponent,
        ...ZardMenuImports,
        ZardIconComponent,
        ...ZardTabsImports,
        DensityDirective
      ]
    })
  ]
} as Meta<ZardTabGroupComponent>

type Story = StoryObj<ZardTabGroupComponent>

export const Primary: Story = {
  args: {}
}

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
