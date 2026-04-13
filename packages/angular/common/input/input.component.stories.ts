// Input.stories.ts

import { provideAnimations } from '@angular/platform-browser/animations'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { applicationConfig, moduleMetadata, type Meta, type StoryObj, argsToTemplate } from '@storybook/angular'
import { NgmInputComponent } from './input.component'

const meta: Meta<NgmInputComponent> = {
  title: 'Common/Input',
  component: NgmInputComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations()]
    }),
    moduleMetadata({
      declarations: [],
      imports: [OcapCoreModule]
    })
  ]
}

export default meta
type Story = StoryObj<NgmInputComponent>

export const Primary: Story = {
  args: {}
}

export const Density: Story = {
  args: {},
  render: (args) => ({
    props: args,
    template: `<div class="flex flex-col gap-2">
<div class="ngm-density__comfort">
  <ngm-input ${argsToTemplate(args)} label="Comfort:"></ngm-input>
</div>
<div class="ngm-density__cosy">
  <ngm-input ${argsToTemplate(args)} label="Cosy:"></ngm-input>
</div>
<div class="ngm-density__compact">
  <ngm-input ${argsToTemplate(args)} label="Compact:"></ngm-input>
</div>
</div>`
  })
}

export const Disabled: Story = {
  args: {
    disabled: true
  }
}
