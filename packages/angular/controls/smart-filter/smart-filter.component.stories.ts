import { provideHttpClient } from '@angular/common/http'
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations'
import {
  DisplayDensity,
  NgmDSCoreService,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN,
  OCAP_MODEL_TOKEN,
  OcapCoreModule,
  provideOcapCore
} from '@metad/ocap-angular/core'
import { provideTranslate } from '@metad/ocap-angular/mock'
import { AgentType, DataSource, DisplayBehaviour, FilterSelectionType, Type } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { Meta, applicationConfig, argsToTemplate, moduleMetadata } from '@storybook/angular'
import { MockAgent } from '../../mock/agent-mock.service'
import { NgmControlsModule } from '../controls.module'
import { NgmSmartFilterComponent } from './smart-filter.component'
import { FormsModule } from '@angular/forms'
import { ZardIconComponent } from '@xpert-ai/headless-ui'

export default {
  title: 'Controls/SmartFilter',
  component: NgmSmartFilterComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideAnimations(), provideHttpClient(), provideTranslate()]
    }),
    moduleMetadata({
      imports: [BrowserAnimationsModule, FormsModule, ZardIconComponent, NgmControlsModule, OcapCoreModule, TranslateModule],
      providers: [
        provideOcapCore(),
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
              const { SQLDataSource } = await import('@metad/ocap-sql')
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
                {
                  name: 'SalesOrder',
                  tables: [{ name: 'SalesOrder' }],
                  dimensions: [
                    {
                      name: 'product',
                      caption: 'productName'
                    },
                    {
                      name: 'Department',
                      caption: 'DepartmentName'
                    }
                  ]
                }
              ]
            }
          },
          multi: true
        }
      ]
    })
  ]
} as Meta<NgmSmartFilterComponent>

export const Primary = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department',
      displayBehaviour: DisplayBehaviour.auto
    },
    options: {}
  }
}

export const DensityCompact = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {},
    appearance: {
    },
    displayDensity: DisplayDensity.compact
  }
}

export const SelectionTypeMultiple = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {
      multiple: true
      // selectionType: FilterSelectionType.Multiple
    },
    appearance: {
      
    },
    displayDensity: DisplayDensity.compact
  }
}

export const AppearanceOutline = {
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {
      selectionType: FilterSelectionType.Multiple
    },
    appearance: {
      appearance: 'outline'
    }
  }
}

const render = (args) => ({
  props: args,
  styles: [
    `.ngm-smart-filter {
      width: 100px;
    }`
  ]
})
export const Width = {
  render,
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {
      selectionType: FilterSelectionType.Multiple
    }
  }
}

export const WidthCompact = {
  render,
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {
      selectionType: FilterSelectionType.Multiple
    },
    appearance: {
    },
    displayDensity: DisplayDensity.compact
  }
}

export const Disabled = {
  args: {
    props: {
      dataSettings: {
        dataSource: 'Sales',
        entitySet: 'SalesOrder3s'
      },
      dimension: {
        dimension: 'Department'
      },
      options: {},
      disabled: true,
    },
    model: {
      members: [
        {
          key: '1',
          caption: 'Department 1'
        },
        {
          key: '2',
          caption: 'Department 2'
        }
      ]
    }
  },
  render: (args) => ({
    props: {
      ...args.props,
      model: args.model
    },
    template: `<div class="flex flex-col gap-2">
  <ngm-smart-filter ${argsToTemplate(args.props)}></ngm-smart-filter>
  <ngm-smart-filter ${argsToTemplate(args.props)} [ngModel]="model"></ngm-smart-filter>
</div>
    
    `,
    styles: [
      `.ngm-smart-filter {
        width: 100px;
      }`
    ]
  })
}

export const Prefix = {
  render: (args) => ({
    props: args,
    template: `
<ngm-smart-filter [dataSettings]="dataSettings" [dimension]="dimension" [options]="options">
    <div ngmPrefix>
      <z-icon zType="search"></z-icon>
    </div>
</ngm-smart-filter>
    `
  }),
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {}
  }
}

export const Suffix = {
  render: (args) => ({
    props: args,
    template: `
<ngm-smart-filter [dataSettings]="dataSettings" [dimension]="dimension" [options]="options">
    <div ngmSuffix>
      <z-icon zType="search"></z-icon>
    </div>
</ngm-smart-filter>
    `
  }),
  args: {
    dataSettings: {
      dataSource: 'Sales',
      entitySet: 'SalesOrder3s'
    },
    dimension: {
      dimension: 'Department'
    },
    options: {}
  }
}
