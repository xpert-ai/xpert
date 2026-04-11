import { IXpertTool, IXpertToolset, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { CommandBus } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import * as dotenv from 'dotenv'
import { ToolNotSupportedError } from '../../../xpert-toolset'
import { ToolInvokeCommand } from '../tool-invoke.command'
import { ToolInvokeHandler } from './tool-invoke.handler'

dotenv.config({ path: '.env' })


describe('ToolInvokeHandler', () => {
	let handler: ToolInvokeHandler
	let commandBus: CommandBus

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ToolInvokeHandler,
				{
					provide: CommandBus,
					useValue: {
						execute: jest.fn()
					}
				}
			]
		}).compile()

		handler = module.get<ToolInvokeHandler>(ToolInvokeHandler)
		commandBus = module.get<CommandBus>(CommandBus)
	})

	it('should be defined', () => {
		expect(handler).toBeDefined()
	})

	it('should handle openapi toolset type', async () => {
		const tool = {
			name: 'testTool',
			toolset: { type: 'openapi' } as IXpertToolset,
			schema: { parameters: [] },
			parameters: {}
		}
		const command = new ToolInvokeCommand(tool)

		const result = await handler.execute(command)

		expect(result).toBeDefined()
	})

	it('should handle builtin toolset category', async () => {
		const tool = {
			name: 'testTool',
			toolset: {
				name: 'Test tavily',
				type: 'tavily',
				category: XpertToolsetCategoryEnum.BUILTIN,
				credentials: {
					tavily_api_key: process.env.TAVILY_API_KEY
				}
			} as IXpertToolset,
			parameters: { query: 'test query' }
		}
		const command = new ToolInvokeCommand(tool)

		const result = await handler.execute(command)

		expect(result).toBeDefined()
	})

	it('should throw ToolNotSupportedError for unsupported toolset type', async () => {
		const tool = {
			name: 'testTool',
			toolset: { type: 'unsupportedType' } as IXpertToolset
		}
		const command = new ToolInvokeCommand(tool)

		await expect(handler.execute(command)).rejects.toThrow(ToolNotSupportedError)
	})
})


describe('ToolInvokeHandler OData', () => {
	let handler: ToolInvokeHandler
	let commandBus: CommandBus
	let toolset: IXpertToolset
	let purchaseOrderToolset: IXpertToolset
	const odataUrl = 'https://services.odata.org/TripPinRESTierService/(S(gpti0o5qv3p14bmkguhklnz0))'
	const sapPurchaseOrderOdataUrl = process.env.ODATA_TOOL_SAP_SYSTEM + `/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV`

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ToolInvokeHandler,
				{
					provide: CommandBus,
					useValue: {
						execute: jest.fn()
					}
				}
			]
		}).compile()

		handler = module.get<ToolInvokeHandler>(ToolInvokeHandler)
		commandBus = module.get<CommandBus>(CommandBus)
		toolset = {
			type: 'odata',
			category: XpertToolsetCategoryEnum.API,
			options: {
				baseUrl: odataUrl
			}
		 } as IXpertToolset

		 purchaseOrderToolset = {
			name: 'Purchase Order',
			type: 'odata',
			category: XpertToolsetCategoryEnum.API,
			options: {
				baseUrl: sapPurchaseOrderOdataUrl
			},
			credentials: {
				auth_type: 'basic',
				username: process.env.ODATA_TOOL_SAP_USERNAME,
				password: process.env.ODATA_TOOL_SAP_PASSWORD
			}
		 } as IXpertToolset
	})

	it('should be defined', () => {
		expect(handler).toBeDefined()
	})

	it('should handle odata toolset query entity', async () => {
		const tool = {
			name: 'Query People',
			enabled: true,
			toolset,
			schema: {
				name: 'People',
				method: 'query',
				parameters: [
					{
						name: 'UserName',
						isKey: true,
						schema: {
							type: 'string'
						}
					}
				]
			},
			parameters: {
				UserName: '123'
			}
		} as IXpertTool
		const command = new ToolInvokeCommand(tool)

		const result = await handler.execute(command)

		console.log(result)

		expect(result).toBeDefined()
	}, 10000)

	it('should handle odata toolset get one entity', async () => {
		
		const tool = {
			name: 'Get People',
			enabled: true,
			toolset,
			schema: {
				name: 'People',
				method: 'get',
				parameters: [
					{
						name: 'UserName',
						isKey: true,
						schema: {
							type: 'string'
						}
					}
				]
			},
			parameters: {
				UserName: 'scottketchum'
			}
		} as IXpertTool
		const command = new ToolInvokeCommand(tool)

		const result = await handler.execute(command)

		expect(result.FirstName).toEqual('Scott')
	}, 10000)

	it('should authenticate sap odata', async () => {
		const tool = {
			name: 'Get People',
			enabled: true,
			toolset: purchaseOrderToolset,
			schema: {
				name: 'A_PurchaseOrder',
				method: 'get',
				parameters: [
					{
						name: 'PurchaseOrder',
						isKey: true,
						schema: {
							type: 'string'
						}
					}
				]
			},
			parameters: {
				PurchaseOrder: 'xxx'
			}
		} as IXpertTool
		const command = new ToolInvokeCommand(tool)

		const result = await handler.execute(command)

		console.log(result)

		expect(result.PurchaseOrder).toEqual('xxx')
	}, 10000)
})
