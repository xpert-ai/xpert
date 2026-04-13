import { CommonModule } from '@angular/common'
import { provideHttpClient } from '@angular/common/http'
import { provideAnimations } from '@angular/platform-browser/animations'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { TranslateModule } from '@ngx-translate/core'
import { Meta, StoryObj, applicationConfig, argsToTemplate, moduleMetadata } from '@storybook/angular'
import { NgmTagsComponent } from './tag.component'

export default {
  title: 'Common/Tags',
  component: NgmTagsComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideTranslate()]
    }),
    moduleMetadata({
      imports: [CommonModule, TranslateModule, NgmTagsComponent, DensityDirective],
      declarations: []
    })
  ]
} as Meta<NgmTagsComponent>

type Story = StoryObj<NgmTagsComponent>

const tags = [
  {
    key: 'tag1',
    caption: 'Tag 1',
  },
  {
    key: 'tag2',
    caption: 'Tag 2',
  },
  {
    key: 'tag3',
    caption: 'Tag 3',
  }
]

export const Primary: Story = {
  args: {
    color: 'primary',
    tags
  }
}

export const Selectable: Story = {
  args: {
    color: 'green',
    selectable: true,
    tags
  }
}

export const Density: Story = {
  args: {
    tags,
    color: 'red'
  },
  render: (args: Partial<NgmTagsComponent>) => ({
    props: args,
    template: `<div class="flex flex-col gap-2">
<div class="ngm-density__comfort">
  <label>Comfort:</label>
  <ngm-tags ${argsToTemplate(args)}></ngm-tags>
</div>
<div class="ngm-density__cosy">
  <label>Cosy:</label>
  <ngm-tags ${argsToTemplate(args)}></ngm-tags>
</div>
<div class="ngm-density__compact">
  <label>Compact:</label>
  <ngm-tags ${argsToTemplate(args)}></ngm-tags>
</div>
</div>`
  })
}

export const Disabled: Story = {
  args: {
    tags,
    color: 'blue',
    disabled: true
  }
}