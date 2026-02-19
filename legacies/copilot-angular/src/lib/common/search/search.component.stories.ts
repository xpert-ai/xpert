import { CommonModule } from '@angular/common'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { provideTranslate } from '@metad/ocap-angular/mock'
import { TranslateModule } from '@ngx-translate/core'
import { Meta, StoryObj, applicationConfig, argsToTemplate, moduleMetadata } from '@storybook/angular'
import { NgmSearchComponent } from './search.component'

export default {
  title: 'Common/Search',
  component: NgmSearchComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideTranslate()]
    }),
    moduleMetadata({
      imports: [CommonModule, TranslateModule, NgmSearchComponent, DensityDirective],
      declarations: []
    })
  ]
} as Meta<NgmSearchComponent>

type Story = StoryObj<NgmSearchComponent>

export const Primary: Story = {
  args: {}
}

export const DensityCompact: Story = {
  args: {
    displayDensity: DisplayDensity.compact
  },
  render: (args: Partial<NgmSearchComponent>) => ({
    args,
    template: `<div class="ngm-density__compact">
    <ngm-search ${argsToTemplate(args)}></ngm-search>
</div>`
  })
}

export const Focus: Story = {
  args: {},
  render: (args: Partial<NgmSearchComponent>) => ({
    args,
    template: `<ngm-search ${argsToTemplate(args)} cdkMonitorSubtreeFocus></ngm-search>`
  })
}
