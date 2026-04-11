import { OCAP_AGENT_TOKEN, OCAP_DATASOURCE_TOKEN } from '@xpert-ai/ocap-angular/core'
import { DataSource, Type } from '@xpert-ai/ocap-core'
import { ServerSocketAgent } from '../services'

/**
 * Provides the dependencies required by the `ocap` framework.
 */
export function provideOcap() {
  return [
    ServerSocketAgent,
    {
      provide: OCAP_AGENT_TOKEN,
      useExisting: ServerSocketAgent,
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
      provide: OCAP_DATASOURCE_TOKEN,
      useValue: {
        type: 'XMLA',
        factory: async (): Promise<Type<DataSource>> => {
          const { XmlaDataSource } = await import('@xpert-ai/ocap-xmla')
          return XmlaDataSource
        }
      },
      multi: true
    }
  ]
}
