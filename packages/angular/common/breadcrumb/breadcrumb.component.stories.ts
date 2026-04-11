import { Meta, moduleMetadata } from "@storybook/angular";
import { NgmBreadcrumbBarComponent } from "./breadcrumb.component";
import { CommonModule } from "@angular/common";
import { BrowserAnimationsModule } from "@angular/platform-browser/animations";
import { OcapCoreModule } from "@xpert-ai/ocap-angular/core";

export default {
  title: 'Common/BreadcrumbBar',
  component: NgmBreadcrumbBarComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, BrowserAnimationsModule, OcapCoreModule ],
      declarations: []
    })
  ]
} as Meta<NgmBreadcrumbBarComponent>

export const Primary = {
  args: {
    steps: [
      {
        value: 'A',
        label: 'Step A',
        active: true
      },
      {
        value: 'B',
        label: 'Step B',
        active: false
      }
    ]
  }
}

export const DensityCosy = {
  render: (args) => ({
    props: args,
    template: `<ngm-breadcrumb-bar [steps]="steps" displayDensity="cosy"></ngm-breadcrumb-bar>`,
  }),
  args: {
    steps: [
      {
        value: 'A',
        label: 'Step A',
        active: true
      },
      {
        value: 'B',
        label: 'Step B',
        active: false
      }
    ]
  }
}

export const DensityCompact = {
  render: (args) => ({
    props: args,
    template: `<ngm-breadcrumb-bar [steps]="steps" displayDensity="compact"></ngm-breadcrumb-bar>`,
  }),
  args: {
    steps: [
      {
        value: 'A',
        label: 'Step A',
        active: true
      },
      {
        value: 'B',
        label: 'Step B',
        active: false
      }
    ]
  }
}

export const Width = {
  render: (args) => ({
    props: args,
    template: `<ngm-breadcrumb-bar style="width: 200px;" [steps]="steps" displayDensity="compact"></ngm-breadcrumb-bar>`,
  }),
  args: {
    steps: [
      {
        value: 'A',
        label: 'Step A AAAAAAAAAAAA',
        active: true
      },
      {
        value: 'B',
        label: 'Step BBBBBBBBBBBBBB',
        active: false
      }
    ]
  }
}