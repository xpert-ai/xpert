import { FormsModule } from '@angular/forms'

import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { Meta, moduleMetadata } from '@storybook/angular'
import { OcapCoreModule } from '../core.module'
import { ButtonGroupDirective } from './button-group.directive'
import {
  ZardButtonComponent,
  ZardChipComponent,
  ZardChipSetComponent,
  ZardIconComponent,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent
} from '@xpert-ai/headless-ui'

export default {
  title: 'Core/ButtonGroupDirective',
  decorators: [
    moduleMetadata({
      imports: [
        FormsModule,

        OcapCoreModule,
        ZardIconComponent,
        ZardButtonComponent,
        ZardChipComponent,
        ZardChipSetComponent,
        ZardToggleGroupComponent,
        ZardToggleGroupItemComponent,
        MatSlideToggleModule,
        ButtonGroupDirective,
      ],
      providers: []
    })
  ]
} as Meta

export const Primary = {
  render: (args: ButtonGroupDirective) => ({
    template: `
    <mat-slide-toggle>Slide me!</mat-slide-toggle>
  
  <div >
  <div >
    <z-icon zType="share"></z-icon>
    <z-icon zSize="default" zType="share"></z-icon>
    <z-icon zSize="sm" zType="share"></z-icon>
  </div>
  
  <div>
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmAppearance="danger">
      <z-icon zType="share"></z-icon>
    </button>
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmAppearance="acrylic">
      <z-icon zType="share"></z-icon>
    </button>
    <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="cosy">
      <z-icon zType="share"></z-icon>
    </button>
    <button z-button zType="ghost" zSize="icon" zShape="circle" displayDensity="compact">
      <z-icon zType="share"></z-icon>
    </button>
  </div>
  
  <div>
    <z-toggle-group name="fontStyle" aria-label="Font Style" ngmAppearance="color" color="primary">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" ngmAppearance="color" color="accent">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" displayDensity="compact"
      ngmAppearance="color" color="accent"
      [value]="'italic'">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" multiple="true" displayDensity="compact"
      ngmAppearance="color" color="accent">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" vertical ngmAppearance="color" color="primary">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" vertical multiple="true" displayDensity="compact"
      ngmAppearance="color" color="accent">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" ngmAppearance="outline" color="primary">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  
    <z-toggle-group name="fontStyle" aria-label="Font Style" ngmAppearance="outline" color="primary" displayDensity="compact">
      <z-toggle-group-item value="bold">Bold</z-toggle-group-item>
      <z-toggle-group-item value="italic">Italic</z-toggle-group-item>
      <z-toggle-group-item value="underline">Underline</z-toggle-group-item>
    </z-toggle-group>
  </div>
  
  <div>
    <z-chip-set aria-label="Fish selection">
      <z-chip>One fish</z-chip>
      <z-chip>Two fish</z-chip>
      <z-chip color="primary" selected>Primary fish</z-chip>
      <z-chip color="accent" selected>Accent fish</z-chip>
      <z-chip color="warn" selected>warn fish</z-chip>
    </z-chip-set>
  
    <z-chip-set aria-label="Fish selection" class="[&_z-chip]:border [&_z-chip]:border-border [&_z-chip]:bg-transparent">
      <z-chip>One fish</z-chip>
      <z-chip>Two fish</z-chip>
      <z-chip color="primary" selected>Primary fish</z-chip>
      <z-chip color="accent" selected>Accent fish</z-chip>
      <z-chip color="warn" selected>warn fish</z-chip>
    </z-chip-set>
  
    <z-chip-set aria-label="Fish selection" class="[&_z-chip]:border [&_z-chip]:border-dashed [&_z-chip]:border-border [&_z-chip]:bg-transparent">
      <z-chip>One fish</z-chip>
      <z-chip>Two fish</z-chip>
      <z-chip color="primary" selected>Primary fish</z-chip>
      <z-chip color="accent" selected>Accent fish</z-chip>
      <z-chip color="warn" selected>warn fish</z-chip>
    </z-chip-set>
  
    <z-chip-set aria-label="Fish selection" displayDensity="compact" class="[&_z-chip]:border [&_z-chip]:border-border [&_z-chip]:bg-transparent">
      <z-chip>One fish</z-chip>
      <z-chip>Two fish</z-chip>
      <z-chip color="primary" selected>Primary fish</z-chip>
      <z-chip color="accent" selected>Accent fish</z-chip>
      <z-chip color="warn" selected>warn fish</z-chip>
    </z-chip-set>
  </div>
  
  <div fxLayout="row wrap" fxLayoutAlign="space-between center" >
    <div ngmButtonGroup>
      <button z-button zType="ghost">Click me!</button>
      <button z-button zType="default" color="primary">Click me!</button>
    </div>
  
    <div ngmButtonGroup>
      <button z-button zType="secondary">Click me!</button>
      <button z-button zType="default" color="primary">Click me!</button>
      <button z-button zType="default" color="accent">Click me!</button>
    </div>
  
    <div ngmButtonGroup displayDensity="cosy">
      <button z-button zType="secondary" displayDensity="cosy">Click me!</button>
      <button z-button zType="default" color="primary" displayDensity="cosy">Click me!</button>
      <button z-button zType="default" color="accent" displayDensity="cosy">Click me!</button>
    </div>
  
    <div ngmButtonGroup displayDensity="compact">
      <button z-button zType="secondary" displayDensity="compact">Click me!</button>
      <button z-button zType="default" color="primary" displayDensity="compact">Click me!</button>
      <button z-button zType="default" color="accent" displayDensity="compact">Click me!</button>
    </div>
  </div>
  
  <div fxLayout="row wrap" fxLayoutAlign="space-between center" >
    <button z-button zType="ghost" color="accent" [zLoading]="true">Accent</button>
  
    <button z-button zType="secondary" [zLoading]="true">Confortable</button>
    <button z-button zType="secondary" displayDensity="cosy" [zLoading]="true">Cosy</button>
    <button z-button zType="secondary" displayDensity="compact" [zLoading]="true">Compact</button>
  
    <button z-button zType="default" color="primary" [zLoading]="true">Primary</button>
    <button z-button zType="default" color="accent" [zLoading]="true">Accent</button>
  
    <button z-button zType="outline" color="accent" [zLoading]="true">Accent</button>
  
    <button z-button zType="ghost" zSize="icon" zShape="circle" [zLoading]="true" color="primary">
      <z-icon zType="more_vert"></z-icon>
    </button>
    <button z-button zType="default" zSize="icon-lg" zShape="circle" [zLoading]="true" color="primary">
      <z-icon zType="delete"></z-icon>
    </button>
    <button z-button zType="default" zSize="icon-sm" zShape="circle" [zLoading]="true" color="primary">
      <z-icon zType="menu"></z-icon>
    </button>
  </div>
  
  <div fxLayout="row wrap" fxLayoutAlign="space-between center" >
    <div ngmButtonGroup>
      <button z-button zType="ghost">Click me!</button>
      <button z-button zType="default" color="accent" [zLoading]="true">Click me!</button>
    </div>
  </div>
  </div>
    `,
    props: args
  }),
  args: {
    text: 'Click me!',
    padding: 10,
    disabled: true
  }
}
