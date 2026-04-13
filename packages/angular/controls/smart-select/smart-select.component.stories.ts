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
import { AgentType, DataSource, Type } from '@xpert-ai/ocap-core'
import { MissingTranslationHandler, TranslateModule } from '@ngx-translate/core'
import { Meta, moduleMetadata } from '@storybook/angular'
import { MockAgent } from '../../mock/agent-mock.service'
import { NgmSmartSelectComponent } from './smart-select.component'

export default {
  title: 'Controls/SmartSelect',
  component: NgmSmartSelectComponent,
  decorators: [
    moduleMetadata({
      imports: [
        BrowserAnimationsModule,
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
} as Meta<NgmSmartSelectComponent>

// const Template: Story<NgmSmartSelectComponent> = (args: NgmSmartSelectComponent) => ({
//   props: args
// })

// export const Primary = Template.bind({})
// Primary.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {}
// }

// export const Multiple = Template.bind({})
// Multiple.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {
//     multiple: true
//   }
// }

// export const DensityCompact = Template.bind({})
// DensityCompact.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {},
//   appearance: {
//     displayDensity: DisplayDensity.compact
//   }
// }

// export const DensityCosy = Template.bind({})
// DensityCosy.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {},
//   appearance: {
//     displayDensity: DisplayDensity.cosy
//   }
// }

// export const AutoActiveFirst = Template.bind({})
// AutoActiveFirst.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {
//     autoActiveFirst: true
//   },
//   appearance: {
//     displayDensity: DisplayDensity.cosy
//   }
// }

// export const UserData = Template.bind({})
// UserData.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {
//     data: [
//       { value: 'A', label: 'A' },
//       { value: 'B', label: 'B' },
//       { value: 'C', label: 'C' }
//     ]
//   },
//   appearance: {
//   },
// }
