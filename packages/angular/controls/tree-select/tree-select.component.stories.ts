import { Component, Input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import { TREE_NODE_DATA } from '@xpert-ai/ocap-angular/common/tree-select/tree-select.component.stories'
import {
  DisplayDensity,
  NgmAppearance,
  NgmDSCoreService,
  NgmMissingTranslationHandler,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN,
  OCAP_MODEL_TOKEN,
  OcapCoreModule
} from '@xpert-ai/ocap-angular/core'
import { AgentType, DataSettings, DataSource, Dimension, Type } from '@xpert-ai/ocap-core'
import { MissingTranslationHandler, TranslateModule } from '@ngx-translate/core'
import { Meta, moduleMetadata, StoryObj } from '@storybook/angular'
import { CUBE_SALES_ORDER, MockAgent } from '../../mock/agent-mock.service'
import { NgmControlsModule } from '../controls.module'
import { MemberTreeSelectOptions, NgmMemberTreeSelectComponent } from './tree-select.component'

@Component({
  selector: 'test-member-tree-select',
  template: `<ngm-member-tree-select
    [dataSettings]="dataSettings"
    [dimension]="dimension"
    [appearance]="appearance"
    [options]="options"
    [data]="data"
    [ngModel]="model"
    (ngModelChange)="onModelChange($event)"
  >
  </ngm-member-tree-select>`
})
class TestMemberTreeSelectComponent<T> {
  @Input() label: string
  @Input() dataSettings: DataSettings
  @Input() dimension: Dimension
  @Input() appearance: NgmAppearance
  @Input() options: MemberTreeSelectOptions
  @Input() data
  @Input() model = {
    members: [{ value: 'Fruit' }]
  }

  onModelChange(event) {
    console.warn(event)
  }
}

export default {
  title: 'Controls/MemberTreeSelect',
  component: NgmMemberTreeSelectComponent,
  decorators: [
    moduleMetadata({
      declarations: [TestMemberTreeSelectComponent],
      imports: [
        BrowserAnimationsModule,
        FormsModule,
        NgmControlsModule,
        OcapCoreModule,
        TranslateModule.forRoot({
          missingTranslationHandler: {
            provide: MissingTranslationHandler,
            useClass: NgmMissingTranslationHandler
          }
        })
      ],
      providers: [
        NgmDSCoreService,
        {
          provide: OCAP_AGENT_TOKEN,
          useClass: MockAgent,
          multi: true
        },
        {
          provide: OCAP_DATASOURCE_TOKEN,
          useValue: {
            type: 'SQL',
            factory: async (): Promise<Type<DataSource>> => {
              const { SQLDataSource } = await import('@xpert-ai/ocap-sql')
              return SQLDataSource
            }
          },
          multi: true
        },
        {
          provide: OCAP_MODEL_TOKEN,
          useValue: {
            name: 'Sales',
            type: 'SQL',
            agentType: AgentType.Browser,
            settings: {
              ignoreUnknownProperty: true
            },
            schema: {
              cubes: [CUBE_SALES_ORDER]
            }
          },
          multi: true
        }
      ]
    })
  ]
} as Meta<NgmMemberTreeSelectComponent>

type Story = StoryObj<NgmMemberTreeSelectComponent>

// const Template: Story<NgmMemberTreeSelectComponent> = (args: NgmMemberTreeSelectComponent) => ({
//   props: args,
//   template: `<test-member-tree-select [label]="label"
//     [dataSettings]="dataSettings"
//     [dimension]="dimension"
//     [appearance]="appearance"
//     [data]="data"
//     [options]="options"
//   ></test-member-tree-select>`
// })

export const Primary: Story = {
  args: {
    dimension: {
      dimension: 'product'
    },
    appearance: {
      displayDensity: DisplayDensity.compact
    },
    data: TREE_NODE_DATA
  }
}

// export const FromDataSource = Template.bind({})
// FromDataSource.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder'
//   },
//   dimension: {
//     dimension: '[Product]',
//     displayBehaviour: DisplayBehaviour.auto
//   },
//   appearance: {
//     displayDensity: DisplayDensity.compact,
//   },
// }

// export const DefaultMembers = Template.bind({})
// DefaultMembers.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder'
//   },
//   dimension: {
//     dimension: '[Product]',
//     displayBehaviour: DisplayBehaviour.auto
//   },
//   appearance: {
//     displayDensity: DisplayDensity.compact,
//   },
//   options: {
//     defaultMembers: [
//       { value: '[Fantastic]' }
//     ]
//   }
// }

// const TemplateWidth: Story<NgmMemberTreeSelectComponent> = (args: NgmMemberTreeSelectComponent) => ({
//   props: args,
//   styles: [
//     `.ngm-member-tree-select {
//       width: 100px;
//     }`
//   ]
// })

// export const Width = TemplateWidth.bind({})
// Width.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'product'
//   },
//   appearance: {
//     displayDensity: DisplayDensity.compact
//   },
//   options: {
//     searchable: true,
//     virtualScroll: true,
//     multiple: true
//   },
//   data: [
//     ...TREE_NODE_DATA,
//     {
//       key: 'FruitLong',
//       label: '水果水果水果水果水果水果水果水果水果水果水果水果水果水果',
//     }
//   ]
// }
