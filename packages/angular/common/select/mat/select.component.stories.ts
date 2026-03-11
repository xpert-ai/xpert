import { CommonModule } from '@angular/common'
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule, ValidatorFn } from '@angular/forms'
import { ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DisplayDensity, OcapCoreModule } from '@metad/ocap-angular/core'
import { DisplayBehaviour, TreeNodeInterface } from '@metad/ocap-core'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import { NgmMatSelectComponent } from './select.component'

@Component({
  selector: 'test-select',
  template: `<ngm-mat-select
    [label]="label"
    [placeholder]="'Please Select ' + label"
    [selectOptions]="selectOptions"
    [multiple]="multiple"
    [virtualScroll]="virtualScroll"
    [displayBehaviour]="displayBehaviour"
    [displayDensity]="displayDensity"
    [validators]="validators"
    [formControl]="formControl"
    (ngModelChange)="onModelChange($event)"
  >
  </ngm-mat-select> `
})
class TestSelectComponent<T> implements OnChanges {
  @Input() caption: string
  @Input() placeholder: string
  @Input() selectOptions: TreeNodeInterface<T>
  @Input() multiple: boolean
  @Input() disabled: boolean
  @Input() virtualScroll: boolean
  @Input() treeViewer: boolean
  @Input() color: string
  @Input() displayBehaviour: DisplayBehaviour | string
  @Input() displayDensity: DisplayDensity | string
  @Input() model = null
  @Input() validators: ValidatorFn | ValidatorFn[] | null

  formControl = new FormControl()

  ngOnInit() {
    if (this.disabled) {
      this.formControl.disable()
    }
    this.formControl.setValue(this.model)
  }

  ngOnChanges({ validators }: SimpleChanges): void {
    //
  }

  onModelChange(event) {
    console.warn(event)
  }
}

const meta: Meta<NgmMatSelectComponent> = {
  title: 'Common/LegacySelect',
  component: NgmMatSelectComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, BrowserAnimationsModule, FormsModule, ReactiveFormsModule, OcapCoreModule, ...ZardFormImports, ZardInputDirective],
      declarations: [TestSelectComponent]
    })
  ]
} as Meta<NgmMatSelectComponent>

export default meta
type Story = StoryObj<NgmMatSelectComponent>

const TREE_NODE_DATA = [
  {
    key: 'Fruit',
    caption: '水果'
  },
  { key: 'Apple', caption: '苹果', raw: { type: 'Hive' } },
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
    label: '饮食选择器',
    selectOptions: TREE_NODE_DATA,
    valueKey: 'key'
  }
}

export const Loading = {
  args: {
    label: '饮食选择器',
    placeholder: '请选择你喜欢的一种食品',
    selectOptions: TREE_NODE_DATA,
    valueKey: 'key',
    loading: true
  }
}

export const Select = {
  args: {
    label: '水果',
    selectOptions: TREE_NODE_DATA,
    model: 'Apple'
  }
}

export const SelectMultiple = {
  args: {
    label: '饮食选择器',
    placeholder: '请选择你喜欢的一种食品',
    selectOptions: TREE_NODE_DATA,
    multiple: true,
    value: ['Apple', 'Pumpkins']
  }
}

export const SelectVirtualScroll = {
  args: {
    label: '饮食选择器',
    placeholder: '请选择你喜欢的一种食品',
    selectOptions: TREE_NODE_DATA,
    multiple: true,
    value: ['Apple', 'Pumpkins'],
    virtualScroll: true
  }
}

export const DensityCosy = {
  args: {
    caption: '饮食选择器',
    placeholder: '请选择你喜欢的一种食品',
    selectOptions: TREE_NODE_DATA,
    displayDensity: DisplayDensity.cosy
  }
}

export const DensityCompact = {
  args: {
    label: '饮食选择器',
    placeholder: '请选择你喜欢的一种食品',
    selectOptions: TREE_NODE_DATA,
    displayDensity: DisplayDensity.compact
  }
}

// const TemplateError: Story<any> = (args: any) => ({
//   props: args,
//   template: `<test-select [label]="label"
//     [selectOptions]="selectOptions"
//     [model]="model"
//     [multiple]="multiple"
//     [virtualScroll]="virtualScroll"
//     [displayBehaviour]="displayBehaviour"
//     [displayDensity]="displayDensity"
//     [disabled]="disabled"
//     [validators]="validators"
//   ></test-select>`,
//   styles: [``]
// })

// export const SelectValidators = TemplateError.bind({})
// SelectValidators.args = {
//   label: '水果',
//   model: 'Apple',
//   selectOptions: TREE_NODE_DATA,
//   validators:  [(control: AbstractControl): ValidationErrors | null => {
//     return control.value.value === "Apple" ? {forbiddenName: '不喜欢这个水果'} : null
//   }]
// }
