import { provideHttpClient } from '@angular/common/http'

import { provideAnimations } from '@angular/platform-browser/animations'
import { OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { provideTranslate } from '@xpert-ai/ocap-angular/mock'
import { Meta, StoryObj, applicationConfig, argsToTemplate, moduleMetadata } from '@storybook/angular'
import { NgmSelectModule } from '../select.module'
import { NgmSelectComponent } from './select.component'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

const meta: Meta<NgmSelectComponent> = {
  title: 'Common/Select',
  component: NgmSelectComponent,
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideTranslate()]
    }),
    moduleMetadata({
      declarations: [],
      imports: [ZardButtonComponent, ZardIconComponent, OcapCoreModule, NgmSelectModule]
    })
  ]
}

export default meta
type Story = StoryObj<NgmSelectComponent>

const TREE_NODE_DATA = [
  {
    key: null,
    caption: '',
    value: {
      name: null
    }
  },
  {
    key: 'Fruit',
    caption: '水果'
  },
  { key: 'Apple', caption: '苹果', value: { type: 'Hive' } },
  { key: 'Banana', caption: '香蕉' },
  { key: 'Fruit loops', caption: '果循环' },
  {
    key: 'Vegetables',
    caption: '蔬菜'
  },
  {
    key: 'Green',
    caption: '绿色'
  },
  { key: 'Broccoli', caption: '西兰花' },
  { key: 'Brussel sprouts', caption: '豆芽' },
  {
    key: 'Orange',
    caption: '橙'
  },
  { key: 'Pumpkins', caption: '南瓜', raw: { type: 'PG' } },
  { key: 'Carrots', caption: '胡萝卜' }
] as any

export const Default = {
  args: {
    selectOptions: TREE_NODE_DATA,
    valueKey: 'key'
  }
}

export const Suffix = {
  render: (args) => ({
    props: args,
    template: `
<ngm-select [selectOptions]="selectOptions">
<div ngmSuffix>suffix</div>
</ngm-select>    
    `
  }),
  args: {
    selectOptions: TREE_NODE_DATA,
    valueKey: 'key'
  }
}

export const SuffixSearchable = {
  render: (args) => ({
    props: args,
    template: `
<ngm-select searchable [selectOptions]="selectOptions" ${argsToTemplate(args)}>
  <div ngmSuffix>
    <z-icon zType="search"></z-icon>
  </div>
</ngm-select>    
    `
  }),
  args: {
    selectOptions: TREE_NODE_DATA,
    valueKey: 'key'
  }
}

export const WithIcon: Story = {
  args: {
    valueKey: 'key',
    selectOptions: [
      {
        key: 'Fruit',
        caption: '水果',
        icon: 'apple'
      }
    ]
  }
}

export const Multiple: Story = {
  args: {
    valueKey: 'key',
    selectOptions: TREE_NODE_DATA,
    multiple: true
  }
}

export const MultipleSearchable: Story = {
  args: {
    valueKey: 'key',
    selectOptions: TREE_NODE_DATA,
    multiple: true,
    searchable: true
  }
}

export const Density: Story = {
  render: (args) => ({
    props: args,
    template: `
<div class="flex items-center gap-4 p-4">
  <ngm-select label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
   [valueKey]="valueKey"
  >
  </ngm-select>

  <ngm-select searchable label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
  </ngm-select>

  <ngm-select label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmSuffix>
      <z-icon zType="close"></z-icon>
    </button>
  </ngm-select>
  <ngm-select searchable label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmSuffix>
      <z-icon zType="close"></z-icon>
    </button>
  </ngm-select>
</div>
<div displayDensity="cosy" class="flex items-center gap-4 p-4">
  <ngm-select label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
  </ngm-select>

  <ngm-select searchable label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
  </ngm-select>

  <ngm-select label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmSuffix>
      <z-icon zType="close"></z-icon>
    </button>
  </ngm-select>
  <ngm-select searchable label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmSuffix>
      <z-icon zType="close"></z-icon>
    </button>
  </ngm-select>
</div>

<div displayDensity="compact" class="flex items-center gap-4 p-4">
  <ngm-select label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
  </ngm-select>

  <ngm-select searchable label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
  </ngm-select>

  <ngm-select label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions" displayDensity="compact"
    [valueKey]="valueKey">
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmSuffix>
      <z-icon zType="close"></z-icon>
    </button>
  </ngm-select>
  <ngm-select searchable label="Fruit" placeholder="Select an option" [selectOptions]="selectOptions"
    [valueKey]="valueKey">
    <button z-button zType="ghost" zSize="icon" zShape="circle" ngmSuffix>
      <z-icon zType="close"></z-icon>
    </button>
  </ngm-select>
</div>
    `
  }),
  args: {
    selectOptions: TREE_NODE_DATA,
    valueKey: 'key'
  }
}
