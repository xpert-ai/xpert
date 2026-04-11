import { BrowserAnimationsModule } from '@angular/platform-browser/animations'
import {
  DisplayDensity,
  NgmMissingTranslationHandler,
  OcapCoreModule,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN,
  OCAP_MODEL_TOKEN,
  NgmDSCoreService
} from '@xpert-ai/ocap-angular/core'
import { AgentType, DataSource, FilterSelectionType, MemberSource, Type } from '@xpert-ai/ocap-core'
import { MissingTranslationHandler, TranslateModule } from '@ngx-translate/core'
import { Meta, StoryObj, argsToTemplate, moduleMetadata } from '@storybook/angular'
import { action } from '@storybook/addon-actions'
import { CUBE_SALES_ORDER, MockAgent } from '../../mock/agent-mock.service'
import { NgmControlsModule } from '../controls.module'
import { NgmMemberTreeComponent } from './member-tree.component'
import { FormsModule } from '@angular/forms'

export default {
  title: 'Controls/MemberTree',
  component: NgmMemberTreeComponent,
  decorators: [
    moduleMetadata({
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
              cubes: [
                CUBE_SALES_ORDER
              ]
            }
          },
          multi: true
        }
      ]
    })
  ],
  render: (args) => ({
    props: {
      ...args,
      loadingChanging: actionsData.loadingChanging
    },
    styles: [`.ngm-member-tree {height: 400px;}`]
  })
} as Meta<NgmMemberTreeComponent>

const actionsData = {
  loadingChanging: action('loadingChanging'),
};

type Story = StoryObj<NgmMemberTreeComponent>

export const Primary: Story = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'product'
    },
    appearance: {
      displayDensity: DisplayDensity.compact
    }
  },
};

export const SourceFrom: Story = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'product'
    },
    options: {
      memberSource: MemberSource.DIMENSION
    }
  },
};

export const Appearance: Story = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'product'
    },
    options: {
      searchable: true
    },
    appearance: {
      appearance: 'outline',
      displayDensity: DisplayDensity.compact
    }
  },
};

export const AutoActiveFirst: Story = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'product'
    },
    options: {
      searchable: true,
      autoActiveFirst: true,
      selectionType: FilterSelectionType.Multiple
    },
    appearance: {
      appearance: 'outline',
      displayDensity: DisplayDensity.compact
    }
  },
  render: (args) => ({
    props: {
      ...args,
      inputValue: '',
    },
    template: `<form>
<label for="input">Custom Input:</label>
  <ngm-member-tree id="input" [(ngModel)]="inputValue" name="customInput" ${argsToTemplate(args)}></ngm-member-tree>
  <p>Value: {{ inputValue | json }}</p>
</form>`,
    styles: [`.ngm-member-tree {height: 400px;}`]
  })
};
