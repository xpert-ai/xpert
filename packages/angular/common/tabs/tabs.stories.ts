import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

export default {
  title: 'Common/MaterialTabs',
  component: MatTabGroup,
  decorators: [
    moduleMetadata({
      imports: [BrowserAnimationsModule, ZardButtonComponent, MatMenuModule, MatIconModule, MatTabsModule, OcapCoreModule]
    })
  ]
} as Meta<MatTabGroup>

type Story = StoryObj<MatTabGroup>

export const Primary: Story = {
  args: {
  },
};

export const CloseButton = ((args: any) => ({
  props: args,
  template: `
<mat-tab-group class="ngm-appearance-desktop" disableRipple>
  <mat-tab label="First">
    <ng-template matTabLabel>First
      <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy" class="ngm-appearance-desktop ngm-tab-button-right" [matMenuTriggerFor]="pointMenu" [matMenuTriggerData]="{point: point}">
          <mat-icon>more_vert</mat-icon>
      </button>
    </ng-template>
   Content 1 </mat-tab>
  <mat-tab label="Second"> Content 2 </mat-tab>
  <mat-tab label="Third"> Content 3 </mat-tab>
</mat-tab-group>
<mat-menu #pointMenu="matMenu" xPosition="before">
  <button mat-menu-item>Item 1</button>
  <button mat-menu-item>Item 2</button>
</mat-menu>
  `,
  styles: [``]
})).bind({})
