import { DataSource, Type } from '@metad/ocap-core'
import { SQLDataSource } from "@metad/ocap-sql"
import { ProxyAgent } from './agent'
import { NgmDSCoreService } from './core.service'
import { OCAP_AGENT_TOKEN, OCAP_DATASOURCES_TOKEN } from './types'
import { MyXmlaDataSource } from './ds-xmla.service'

export function provideOcap() {
	return [
		NgmDSCoreService,
		{
			provide: OCAP_AGENT_TOKEN,
			useClass: ProxyAgent
		},
		{
			provide: OCAP_DATASOURCES_TOKEN,
			useValue: [
				{
					type: 'XMLA',
					factory: async (): Promise<Type<DataSource>> => {
						return MyXmlaDataSource
					}
				},
				{
					type: 'SQL',
					factory: async (): Promise<Type<DataSource>> => {
						return SQLDataSource
					}
				}
			]
		},
		// {
		// 	provide: OCAP_DATASOURCE_TOKEN,
		// 	useValue: {
		// 		type: 'XMLA',
		// 		factory: async (): Promise<Type<DataSource>> => {
		// 			return MyXmlaDataSource
		// 		}
		// 	},
		// 	multi: true
		// },
		// {
		// 	provide: OCAP_DATASOURCE_TOKEN,
		// 	useValue: {
		// 		type: 'SQL',
		// 		factory: async (): Promise<Type<DataSource>> => {
		// 			return SQLDataSource
		// 		}
		// 	},
		// 	multi: true
		// }
	]
}
