import { CommonModule } from '@angular/common'
import { Component, Input } from '@angular/core'
import { AbstractControl, FormsModule, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DisplayDensity, NgmMissingTranslationHandler, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour, TreeNodeInterface } from '@xpert-ai/ocap-core'
import { MissingTranslationHandler, TranslateModule } from '@ngx-translate/core'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import { NgmTreeSelectComponent } from './tree-select.component'

@Component({
  selector: 'test-tree-select',
  template: `<ngm-tree-select
    [label]="label"
    [initialLevel]="initialLevel"
    [treeNodes]="treeNodes"
    [placeholder]="'Please Select ' + label"
    [multiple]="multiple"
    [disabled]="disabled"
    [autocomplete]="autocomplete"
    [maxTagCount]="maxTagCount"
    [virtualScroll]="virtualScroll"
    [panelWidth]="panelWidth"
    [displayBehaviour]="displayBehaviour"
    [displayDensity]="displayDensity"
    [treeViewer]="treeViewer"
    [searchable]="searchable"
    [color]="color"
    [validators]="validators"
    [ngModel]="model"
    (ngModelChange)="onModelChange($event)">
  </ngm-tree-select>`
})
class TestTreeSelectComponent<T> {
  
  @Input() label: string
  @Input() placeholder: string
  @Input() treeNodes: TreeNodeInterface<T>
  @Input() multiple: boolean
  @Input() disabled: boolean
  @Input() initialLevel: number
  @Input() maxTagCount: number
  @Input() autocomplete: boolean
  @Input() virtualScroll: boolean
  @Input() panelWidth: string | number
  @Input() treeViewer: boolean
  @Input() searchable: boolean
  @Input() color: string
  @Input() displayBehaviour: DisplayBehaviour | string
  @Input() displayDensity: DisplayDensity | string
  @Input() model = null
  @Input() validators: ValidatorFn | ValidatorFn[] | null

  onModelChange(event) {
    console.warn(event)
  }
}

export default {
  title: 'Common/TreeSelect',
  decorators: [
    moduleMetadata({
      imports: [
        CommonModule,
        BrowserAnimationsModule,
        FormsModule,
        ReactiveFormsModule,
        TranslateModule.forRoot({
          missingTranslationHandler: {
            provide: MissingTranslationHandler,
            useClass: NgmMissingTranslationHandler
          }
        }),
        NgmTreeSelectComponent,
        OcapCoreModule
      ],
      declarations: [TestTreeSelectComponent]
    })
  ]
} as Meta<NgmTreeSelectComponent<unknown>>

export const TREE_NODE_DATA = [
  {
    key: 'Fruit',
    label: '水果',
    children: [
      { key: 'Apple', label: '苹果', value: 10, raw: { type: 'Hive' } },
      { key: 'Banana', label: '香蕉', value: 20 },
      { key: 'Fruit loops', label: '果循环', value: 30 },
      {
        key: 'Fruit2',
        label: '水果'
      }
    ]
  },
  {
    key: 'Vegetables',
    label: '蔬菜',
    children: [
      {
        key: 'Green',
        label: '绿色',
        children: [
          { key: 'Broccoli', label: '西兰花', value: 10 },
          { key: 'Brussel sprouts', label: '豆芽', value: 20 }
        ]
      },
      {
        key: 'Orange',
        label: '橙',
        children: [
          { key: 'Pumpkins', label: '南瓜', value: 30, raw: { type: 'PG' } },
          { key: 'Carrots', label: '胡萝卜', value: 40 }
        ]
      }
    ]
  }
] as any

type Story = StoryObj<NgmTreeSelectComponent<unknown>>

export const ATreeSelectVirtualScroll: Story = {
  args: {
    label: '饮食选择器',
    placeholder: '请选择你喜欢的一种食品',
    treeNodes: TREE_NODE_DATA,
    searchable: true,
    virtualScroll: true
  },
}

// const Template: Story<any> = (args: any) => ({
//   props: args,
//   template: `<test-tree-select [label]="label" [treeNodes]="treeNodes" [model]="model" [multiple]="multiple"
//     [maxTagCount]="maxTagCount"
//     [autocomplete]="autocomplete" [virtualScroll]="virtualScroll" [panelWidth]="panelWidth"
//     [displayBehaviour]="displayBehaviour" [displayDensity]="displayDensity" [treeViewer]="treeViewer"
//     [searchable]="searchable"
//     [color]="color"
//     [initialLevel]="initialLevel"
//     [validators]="validators"
//     [disabled]="disabled"
//     >
//   </test-tree-select>`,
//   styles: [``]
// })

// export const ATreeSelectVirtualScroll = Template.bind({})
// ATreeSelectVirtualScroll.args = {
//   placeholder: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   model: 'Apple',
//   searchable: true,
//   virtualScroll: true
// }

// export const ATreeSelect = Template.bind({})
// ATreeSelect.args = {
//   treeNodes: TREE_NODE_DATA,
//   model: 'Apple',
//   searchable: true,
//   label: '水果选择器',
//   initialLevel: 3
// }

// export const TreeSelectWithNoSelectOptions = Template.bind({})
// TreeSelectWithNoSelectOptions.args = {
//   model: 'Apple',
//   searchable: true,
//   label: '水果选择器',
//   initialLevel: 2
// }

// export const ATreeSelectMultipleSearchable = Template.bind({})
// ATreeSelectMultipleSearchable.args = {
//   label: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   model: ['Apple'],
//   searchable: true,
//   multiple: true,
// }

// export const ATreeSelectMultiple = Template.bind({})
// ATreeSelectMultiple.args = {
//   label: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   model: ['Fruit', 'Apple']
// }

// export const CAutocomplete = Template.bind({})
// CAutocomplete.args = {
//   label: 'AutoComplete',
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   model: 'Apple'
// }

// export const DAutocompleteMultiple = Template.bind({})
// DAutocompleteMultiple.args = {
//   label: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   autocomplete: true,
//   model: ['Fruit', 'Apple']
// }

// export const DAutocompleteMaxTag = Template.bind({})
// DAutocompleteMaxTag.args = {
//   label: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   autocomplete: true,
//   maxTagCount: 2,
//   model: ['Fruit', 'Apple']
// }

// export const EAutocompleteVirtualScroll = Template.bind({})
// EAutocompleteVirtualScroll.args = {
//   label: 'AutoComplete',
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   virtualScroll: true,
//   model: 'Apple'
// }

// export const EAutocompleteVirtualScrollWidth = Template.bind({})
// EAutocompleteVirtualScrollWidth.args = {
//   label: 'AutoComplete',
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   virtualScroll: true,
//   panelWidth: '500px',
//   model: 'Apple'
// }

// export const FAutocompleteMultipleVirtualScroll = Template.bind({})
// FAutocompleteMultipleVirtualScroll.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   autocomplete: true,
//   virtualScroll: true,
//   model: ['Fruit', 'Apple']
// }

// export const GTreeSelectDisplayBehaviour = Template.bind({})
// GTreeSelectDisplayBehaviour.args = {
//   treeNodes: TREE_NODE_DATA,
//   displayBehaviour: DisplayBehaviour.descriptionAndId,
//   model: 'Apple'
// }

// export const HTreeSelectMultipleBehaviour = Template.bind({})
// HTreeSelectMultipleBehaviour.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   displayBehaviour: DisplayBehaviour.descriptionAndId,
//   model: ['Fruit', 'Apple']
// }

// export const IAutocompleteDisplayBehaviour = Template.bind({})
// IAutocompleteDisplayBehaviour.args = {
//   label: 'Autocomplete & DisplayBehaviour',
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   displayBehaviour: DisplayBehaviour.descriptionAndId,
//   model: 'Apple'
// }

// export const JAutocompleteMultipleBehaviour = Template.bind({})
// JAutocompleteMultipleBehaviour.args = {
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   multiple: true,
//   displayBehaviour: DisplayBehaviour.descriptionAndId,
//   model: ['Fruit', 'Apple']
// }

// export const ATreeSelectDensityCosy = Template.bind({})
// ATreeSelectDensityCosy.args = {
//   label: 'TreeSelect Density',
//   treeNodes: TREE_NODE_DATA,
//   displayDensity: DisplayDensity.cosy,
//   model: 'Apple'
// }

// export const CAutocompleteDensityCosy = Template.bind({})
// CAutocompleteDensityCosy.args = {
//   label: 'AutoComplete Density',
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   displayDensity: DisplayDensity.cosy,
//   model: 'Apple'
// }

// export const ATreeSelectDensityCompact = Template.bind({})
// ATreeSelectDensityCompact.args = {
//   label: 'TreeSelect Density',
//   treeNodes: TREE_NODE_DATA,
//   searchable: true,
//   displayDensity: DisplayDensity.compact,
//   model: 'Apple'
// }

// export const CAutocompleteDensityCompact = Template.bind({})
// CAutocompleteDensityCompact.args = {
//   label: 'AutoComplete Density',
//   treeNodes: TREE_NODE_DATA,
//   autocomplete: true,
//   displayDensity: DisplayDensity.compact,
//   model: 'Apple'
// }

// export const BTreeSelectMultipleDensityCompact = Template.bind({})
// BTreeSelectMultipleDensityCompact.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   displayDensity: DisplayDensity.compact,
//   model: ['Fruit', 'Apple']
// }

// export const KTreeViewer = Template.bind({})
// KTreeViewer.args = {
//   treeNodes: TREE_NODE_DATA,
//   treeViewer: true,
//   model: 'Fruit'
// }

// export const KTreeViewerCompact = Template.bind({})
// KTreeViewerCompact.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   displayDensity: DisplayDensity.compact,
//   treeViewer: true,
//   model: ['Fruit', 'Apple']
// }

// export const KTreeViewerColorAccent = Template.bind({})
// KTreeViewerColorAccent.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   treeViewer: true,
//   color: 'accent',
//   model: ['Fruit', 'Apple']
// }

// export const KTreeViewerColorPrimary = Template.bind({})
// KTreeViewerColorPrimary.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   treeViewer: true,
//   color: 'primary',
//   model: ['Fruit', 'Apple']
// }

// export const KTreeViewerSearchable = Template.bind({})
// KTreeViewerSearchable.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   treeViewer: true,
//   searchable: true,
//   model: ['Fruit', 'Apple']
// }

// const TemplateWidth: Story<any> = (args: any) => ({
//   props: args,
//   styles: [`.ngm-tree-select {width: 100px;}`]
// })

// export const LWidth = TemplateWidth.bind({})
// LWidth.args = {
//   treeNodes: [
//     ...TREE_NODE_DATA,
//     {
//       key: 'Fruit GT',
//       label: '水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果',
//     }
//   ],
//   multiple: true,
//   searchable: true,
//   model: ['Fruit', 'Apple']
// }

// export const LWidthNGT = TemplateWidth.bind({})
// LWidthNGT.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   searchable: true,
//   model: ['Fruit', 'Apple']
// }

// export const LAutocompleteWidth = TemplateWidth.bind({})
// LAutocompleteWidth.args = {
//   treeNodes: [
//     ...TREE_NODE_DATA,
//     {
//       key: 'Fruit GT',
//       label: '水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果水果',
//     }
//   ],
//   autocomplete: true,
//   searchable: true,
//   multiple: true,
//   panelWidth: 'auto',
//   model: ['Fruit', 'Apple']
// }

// export const Disabled = Template.bind({})
// Disabled.args = {
//   treeNodes: TREE_NODE_DATA,
//   model: 'Apple',
//   searchable: true,
//   label: '水果选择器',
//   initialLevel: 3,
//   disabled: true
// }

// export const DisabledTreeView = Template.bind({})
// DisabledTreeView.args = {
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   treeViewer: true,
//   searchable: true,
//   model: ['Fruit', 'Apple'],
//   disabled: true
// }

// export const TreeSelectInitialLevel = Template.bind({})
// TreeSelectInitialLevel.args = {
//   treeNodes: TREE_NODE_DATA,
//   model: 'Apple',
//   searchable: true,
//   label: '水果选择器',
//   initialLevel: 3
// }

// export const TreeSelectValidators = Template.bind({})
// TreeSelectValidators.args = {
//   label: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   searchable: true,
//   model: ['Fruit', 'Apple'],
//   validators:  [(control: AbstractControl): ValidationErrors | null => {
//     console.log(control.value)
//     return Array.isArray(control.value) ? control.value.find((item) => item.key === 'Apple')
//       ? {forbiddenName: '不喜欢这个水果'} : null : 
//       control.value?.key === 'Apple' ? {forbiddenName: '不喜欢这个水果'} : null
//   }]
// }

// export const TreeSelectMultipleValidators = Template.bind({})
// TreeSelectMultipleValidators.args = {
//   label: '水果选择器',
//   treeNodes: TREE_NODE_DATA,
//   multiple: true,
//   searchable: true,
//   model: ['Fruit', 'Apple'],
//   validators:  [(control: AbstractControl): ValidationErrors | null => {
//     console.log(control.value)
//     return Array.isArray(control.value) ? control.value.find((item) => item.key === 'Apple')
//       ? {forbiddenName: '不喜欢这个水果'} : null : 
//       control.value?.key === 'Apple' ? {forbiddenName: '不喜欢这个水果'} : null

//   }]
// }
