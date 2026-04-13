import { AfterViewInit, Component, TemplateRef, ViewChild } from '@angular/core'
import { RouterModule } from '@angular/router'

import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { DisplayDensity, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { Meta, StoryObj, moduleMetadata } from '@storybook/angular'
import { TreeTableComponent } from './tree-table.component'
import { TreeTableModule } from './tree-table.module'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

const TREE_NODE_DATA = [
  {
    name: 'Fruit',
    children: [
      { name: 'Apple', value: 10, raw: { type: 'Hive' } },
      { name: 'Banana', value: 20 },
      { name: 'Fruit loops', value: 30 }
    ]
  },
  {
    name: 'Vegetables',
    children: [
      {
        name: 'Green',
        children: [
          { name: 'Broccoli', value: 10 },
          { name: 'Brussel sprouts', value: 20 }
        ]
      },
      {
        name: 'Orange',
        children: [
          { name: 'Pumpkins', value: 30, raw: { type: 'PG' } },
          { name: 'Carrots', value: 40 }
        ]
      }
    ]
  }
] as any

@Component({
  selector: 'ngm-test-tree-table-cell-template',
  template: `
<ng-template #cell let-data="name">
  <button z-button zType="ghost">
    {{data}}
  </button>
</ng-template>
<ng-template #name let-data="name">
  <a href="{{data}}">{{data}}</a>
</ng-template>

<ngm-tree-table [columns]="columns" [data]="data" [nameCellTemplate]="name"></ngm-tree-table>  
  `
})
class TestCellTemplate implements AfterViewInit {

  @ViewChild('cell') cell: TemplateRef<any>

  data = TREE_NODE_DATA
  columns

  ngOnInit() {
    //
  }

  ngAfterViewInit(): void {
    this.columns = [
      {
        name: 'type',
        caption: '类型',
        cellTemplate: this.cell
      }
    ]
  }
}

export default {
  title: 'Common/TreeTable',
  component: TreeTableComponent,
  decorators: [
    moduleMetadata({
      imports: [BrowserAnimationsModule, ZardButtonComponent, RouterModule, TreeTableModule, OcapCoreModule],
      declarations: [ TestCellTemplate ]
    })
  ]
} as Meta<TreeTableComponent<unknown>>

type Story = StoryObj<TreeTableComponent<unknown>>

export const Primary: Story = {
  args: {
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型'
      }
    ]
  },
};

export const DensityCompact: Story = {
  args: {
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型'
      }
    ],
    displayDensity: DisplayDensity.compact
  }
}

export const Striped: Story = {
  args: {
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型'
      }
    ],
    displayDensity: DisplayDensity.compact,
    striped: true
  }
}

export const Grid: Story = {
  args: {
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型'
      }
    ],
    displayDensity: DisplayDensity.compact,
    grid: true
  }
}

export const Pipe: Story = {
  args: {
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型',
        pipe: (value) => {
          return `Type is ` + value
        }
      }
    ],
    displayDensity: DisplayDensity.compact,
    striped: true
  }
}

export const InitialLevel: Story = {
  args: {
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型'
      }
    ],
    initialLevel: Number.MAX_SAFE_INTEGER
  }
}

export const StickyHeaders: Story = {
  args: {
    nameLabel: '名称',
    data: TREE_NODE_DATA,
    columns: [
      {
        name: 'type',
        caption: '类型'
      }
    ],
    initialLevel: Number.MAX_SAFE_INTEGER,
    stickyHeaders: true
  }
}

export const CellTemplate: Story = {
  args: {
  },
  render: (args: Partial<TestCellTemplate>) => ({
    template: `<ngm-test-tree-table-cell-template></ngm-test-tree-table-cell-template>`
  })
}
