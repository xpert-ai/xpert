import { AgentType, DataSource, Type } from '@xpert-ai/ocap-core'
import {
  NgmDSCoreService,
  NgmOcapCoreService,
  OCAP_AGENT_TOKEN,
  OCAP_DATASOURCE_TOKEN,
  OCAP_MODEL_TOKEN
} from '../core'
import { CUBE_SALES_ORDER, MockAgent } from './agent-mock.service'

export const MODEL_KEY = 'key_sales'

export function provideOcapMock() {
  return [
    NgmOcapCoreService,
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
        key: MODEL_KEY,
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
}
