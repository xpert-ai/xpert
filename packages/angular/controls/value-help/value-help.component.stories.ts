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
import { CUBE_SALES_ORDER, MockAgent } from '../../mock/agent-mock.service'
import { NgmControlsModule } from '../controls.module'
import { NgmValueHelpComponent } from './value-help.component'

export default {
  title: 'Controls/ValueHelp',
  component: NgmValueHelpComponent,
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
                CUBE_SALES_ORDER
              ]
            }
          },
          multi: true
        }
      ]
    })
  ]
} as Meta<NgmValueHelpComponent>

// const Template: Story<NgmValueHelpComponent> = (args: NgmValueHelpComponent) => ({
//   props: args
// })

// export const Primary = Template.bind({})
// Primary.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder'
//   },
//   dimension: {
//     dimension: '[Product]'
//   },
//   options: {
//     searchable: true
//   },
// }

// export const MemberSourceFromDimension = Template.bind({})
// MemberSourceFromDimension.args = {
//   dataSettings: {
//     dataSource: 'Sales',
//     entitySet: 'SalesOrder'
//   },
//   dimension: {
//     dimension: '[Product]'
//   },
//   options: {
//     memberSource: MemberSource.DIMENSION,
//     searchable: true
//   },
//   appearance: {
//     displayDensity: DisplayDensity.cosy
//   }
// }
