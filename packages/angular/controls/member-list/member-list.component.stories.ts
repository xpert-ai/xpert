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
import { AgentType, DataSource, MemberSource, Type } from '@xpert-ai/ocap-core'
import { MissingTranslationHandler, TranslateModule } from '@ngx-translate/core'
import { Meta, moduleMetadata } from '@storybook/angular'
import { MockAgent } from '../../mock/agent-mock.service'
import { NgmControlsModule } from '../controls.module'
import { NgmMemberListComponent } from './member-list.component'

export default {
  title: 'Controls/MemberList',
  component: NgmMemberListComponent,
  decorators: [
    moduleMetadata({
      imports: [
        BrowserAnimationsModule,
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
} as Meta<NgmMemberListComponent>

// const Template: Story<NgmMemberListComponent> = (args: NgmMemberListComponent) => ({
//   props: args,
//   styles: [`.ngm-member-list {height: 200px;}`]
// })

// export const Primary = Template.bind({})
// Primary.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   }
// }

// export const SourceFrom = Template.bind({})
// SourceFrom.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {
//     memberSource: MemberSource.DIMENSION
//   }
// }

// export const Appearance = Template.bind({})
// Appearance.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder3s'
//   },
//   dimension: {
//     dimension: 'Department'
//   },
//   options: {
//     searchable: true
//   },
//   appearance: {
//     appearance: 'outline',
//     displayDensity: DisplayDensity.compact
//   }
// }
