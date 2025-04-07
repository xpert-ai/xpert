import { ApiAuthType } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { QueryBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import * as dotenv from 'dotenv'
import { GetODataRemoteMetadataQuery } from '../get-odata-remote-metadata.query'
import { GetODataRemoteMetadataHandler } from './get-odata-remote-metadata.handler'

dotenv.config({ path: '.env' })

describe('GetODataRemoteMetadataHandler', () => {
	let handler: GetODataRemoteMetadataHandler
	let queryBus: QueryBus

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				GetODataRemoteMetadataHandler,
				{
					provide: QueryBus,
					useValue: {
						execute: jest.fn()
					}
				},
				{
					provide: ConfigService,
					useValue: {}
				}
			]
		}).compile()

		handler = module.get<GetODataRemoteMetadataHandler>(GetODataRemoteMetadataHandler)
		queryBus = module.get<QueryBus>(QueryBus)
	})

	// Additional tests for other auth types can be added here
	it('should handle REAL API with BASIC auth type', async () => {
		const sapPurchaseOrderOdataUrl = process.env.ODATA_TOOL_SAP_SYSTEM + `/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV`
		const credentials = {
			auth_type: ApiAuthType.BASIC,
			username: process.env.ODATA_TOOL_SAP_USERNAME,
			password: process.env.ODATA_TOOL_SAP_PASSWORD
		}
		const query = new GetODataRemoteMetadataQuery(sapPurchaseOrderOdataUrl, credentials)

		const result = await handler.execute(query)
		expect(result.tools.length).toBeGreaterThan(0)
		expect(result.schema).toBeDefined()
	})
})
