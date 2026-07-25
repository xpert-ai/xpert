jest.mock('../../model', () => ({
	SemanticModelService: class SemanticModelService {}
}))

import { SemanticModelService } from '../../model'
import { DataXQueryAnalysisService } from './datax-query-analysis.service'

describe('DataXQueryAnalysisService', () => {
	it('maps semantic models and their cubes into query contexts', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.findMy.mockResolvedValue({
			items: [
				{
					id: 'model-1',
					name: 'Retail',
					description: 'Retail analytics',
					catalog: 'demo',
					draft: {
						schema: {
							name: 'Retail',
							cubes: [{ name: 'Sales', caption: 'Sales cube' }],
							virtualCubes: [{ name: 'Executive' }]
						}
					}
				}
			]
		})

		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)
		const models = await service.listModels('retail')

		expect(models).toEqual([
			expect.objectContaining({
				id: 'model-1',
				name: 'Retail',
				cubes: [{ name: 'Sales', caption: 'Sales cube' }, { name: 'Executive' }]
			})
		])
		expect(semanticModelService.findMy).toHaveBeenCalledWith(
			expect.objectContaining({
				take: 100
			})
		)
	})

	it('returns normalized real query rows and caps the visible result', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.queryUose.mockResolvedValue({
			columns: [
				{ name: 'Store', type: 'string' },
				{ name: 'Sales', type: 'number' }
			],
			rows: [
				{ Store: 'Shanghai', Sales: 120 },
				{ Store: 'Beijing', Sales: 90 },
				{ Store: 'Shenzhen', Sales: 80 }
			],
			rowCount: 3,
			mdx: 'SELECT ...',
			sql: 'select ...',
			audit: {
				traceId: 'trace-1',
				taskId: 'task-1',
				durationMs: 42
			}
		})
		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)

		const result = await service.execute(
			{
				modelId: 'model-1',
				cubeName: 'Sales',
				statement: 'SELECT [Measures].[Sales] ON COLUMNS FROM [Sales]',
				limit: 2,
				openWorkbench: false
			},
			{
				tenantId: 'tenant-1',
				organizationId: 'org-1',
				userId: 'user-1'
			}
		)

		expect(semanticModelService.queryUose).toHaveBeenCalledWith(
			expect.objectContaining({
				queryMode: 'mdx_statement',
				modelId: 'model-1',
				cubeName: 'Sales',
				statement: 'SELECT [Measures].[Sales] ON COLUMNS FROM [Sales]',
				limit: 2,
				context: expect.objectContaining({
					tenantId: 'tenant-1',
					organizationId: 'org-1',
					principalId: 'user-1'
				})
			})
		)
		expect(result).toMatchObject({
			columns: [
				{ name: 'Store', type: 'string' },
				{ name: 'Sales', type: 'number' }
			],
			rows: [
				{ Store: 'Shanghai', Sales: 120 },
				{ Store: 'Beijing', Sales: 90 }
			],
			rowCount: 2,
			totalRowCount: 3,
			truncated: true,
			sql: 'select ...'
		})
	})

	it('propagates governed query adapter errors without inventing rows', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.queryUose.mockResolvedValue({
			code: 'INVALID_MDX',
			message: 'Unknown measure'
		})
		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)

		await expect(
			service.execute(
				{
					modelId: 'model-1',
					cubeName: 'Sales',
					statement: 'SELECT [Measures].[Missing] ON COLUMNS FROM [Sales]',
					openWorkbench: false
				},
				{
					userId: 'user-1'
				}
			)
		).rejects.toThrow('INVALID_MDX: Unknown measure')
	})

	it('falls back to a schema-governed source aggregation for a measures-only query', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.queryUose.mockResolvedValue({
			code: 'UOSE-MDX-5001',
			message: 'No value present'
		})
		semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			draft: {
				schema: {
					cubes: [
						{
							name: 'Sales',
							fact: {
								table: {
									name: 'demo.adv_sales'
								}
							},
							measures: [
								{
									name: 'Sales Amount',
									column: 'sales_amount',
									aggregator: 'sum'
								}
							]
						}
					]
				}
			}
		})
		semanticModelService.query.mockResolvedValue({
			columns: [{ name: 'Sales Amount', type: 'number' }],
			data: [{ 'Sales Amount': 442083810.72 }]
		})
		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)

		const result = await service.execute(
			{
				modelId: 'model-1',
				cubeName: 'Sales',
				statement: 'SELECT [Measures].Members ON COLUMNS FROM [Sales]',
				openWorkbench: false
			},
			{
				userId: 'user-1'
			}
		)

		expect(semanticModelService.query).toHaveBeenCalledWith(
			'model-1',
			{
				statement: 'SELECT SUM("sales_amount") AS "Sales Amount" FROM "demo"."adv_sales" LIMIT 200'
			},
			{}
		)
		expect(result).toMatchObject({
			rows: [{ 'Sales Amount': 442083810.72 }],
			rowCount: 1,
			totalRowCount: 1,
			truncated: false,
			sql: 'SELECT SUM("sales_amount") AS "Sales Amount" FROM "demo"."adv_sales" LIMIT 200'
		})
	})

	it('falls back to a governed dimension join and measure aggregation for a grouped query', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.queryUose.mockResolvedValue({
			code: 'UOSE-MDX-5001',
			message: 'No value present'
		})
		semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			draft: {
				schema: {
					dimensions: [
						{
							name: 'Reseller',
							hierarchies: [
								{
									name: 'Reseller',
									primaryKey: 'id',
									tables: [{ name: 'demo.adv_reseller' }],
									levels: [
										{
											name: 'Reseller',
											caption: 'Reseller',
											column: 'reseller_name'
										}
									]
								}
							]
						}
					],
					cubes: [
						{
							name: 'Sales',
							fact: {
								table: {
									name: 'demo.adv_sales'
								}
							},
							dimensionUsages: [
								{
									name: 'Reseller',
									source: 'Reseller',
									foreignKey: 'reseller_id'
								}
							],
							measures: [
								{
									name: 'Sales Amount',
									column: 'sales_amount',
									aggregator: 'sum'
								}
							]
						}
					]
				}
			}
		})
		semanticModelService.query.mockResolvedValue({
			columns: [
				{ name: 'Reseller', type: 'string' },
				{ name: 'Sales Amount', type: 'number' }
			],
			data: [
				{ Reseller: 'Adventure Works', 'Sales Amount': 1287450.32 },
				{ Reseller: 'Contoso', 'Sales Amount': 936210.75 }
			]
		})
		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)

		const result = await service.execute(
			{
				modelId: 'model-1',
				cubeName: 'Sales',
				statement:
					'SELECT {[Measures].[Sales Amount]} ON COLUMNS, [Reseller].[Reseller].Members ON ROWS FROM [Sales]',
				openWorkbench: false
			},
			{
				userId: 'user-1'
			}
		)

		expect(semanticModelService.query).toHaveBeenCalledWith(
			'model-1',
			{
				statement:
					'SELECT d."reseller_name" AS "Reseller", SUM(f."sales_amount") AS "Sales Amount" FROM "demo"."adv_sales" AS f LEFT JOIN "demo"."adv_reseller" AS d ON f."reseller_id" = d."id" GROUP BY d."reseller_name" LIMIT 200'
			},
			{}
		)
		expect(result).toMatchObject({
			rows: [
				{ Reseller: 'Adventure Works', 'Sales Amount': 1287450.32 },
				{ Reseller: 'Contoso', 'Sales Amount': 936210.75 }
			],
			rowCount: 2,
			totalRowCount: 2,
			truncated: false
		})
	})

	it('accepts Agent-style numeric MDX axes and dimension properties in the governed fallback', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.queryUose.mockResolvedValue({
			code: 'UOSE-MDX-5001',
			message: 'syntax error at or near "["'
		})
		semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			draft: {
				schema: {
					dimensions: [
						{
							name: 'Date',
							label: 'Date',
							table: 'demo.adv_date',
							primaryKey: 'date_key',
							hierarchies: [
								{
									name: 'Calendar',
									levels: [
										{
											name: 'Year',
											label: 'Year',
											column: 'year_key'
										}
									]
								}
							]
						}
					],
					cubes: [
						{
							name: 'Sales',
							table: 'demo.adv_sales',
							dimensions: [
								{
									name: 'Date',
									type: 'shared',
									foreignKeys: [
										{
											column: 'order_date_key',
											referencedDimension: 'Date',
											referencedColumn: 'date_key'
										}
									]
								}
							],
							measures: [
								{
									name: 'Sales Amount',
									label: 'Revenue',
									column: 'sales_amount',
									aggregator: 'sum'
								}
							]
						}
					]
				}
			}
		})
		semanticModelService.query.mockResolvedValue({
			data: [
				{ Year: 2022, Revenue: 125000 },
				{ Year: 2023, Revenue: 164000 }
			]
		})
		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)

		const statement = `SELECT NON EMPTY {[Measures].[Revenue]} ON 0,
NON EMPTY {[Date].[Calendar].[Year].Members} DIMENSION PROPERTIES [Date].[Calendar].[Year] ON 1
FROM [Sales]
CELL PROPERTIES VALUE`
		const result = await service.execute(
			{
				modelId: 'model-1',
				cubeName: 'Sales',
				statement,
				openWorkbench: false
			},
			{
				userId: 'user-1'
			}
		)

		expect(semanticModelService.query).toHaveBeenCalledWith(
			'model-1',
			{
				statement:
					'SELECT d."year_key" AS "Year", SUM(f."sales_amount") AS "Sales Amount" FROM "demo"."adv_sales" AS f LEFT JOIN "demo"."adv_date" AS d ON f."order_date_key" = d."date_key" GROUP BY d."year_key" LIMIT 200'
			},
			{}
		)
		expect(result).toMatchObject({
			rows: [
				{ Year: 2022, Revenue: 125000 },
				{ Year: 2023, Revenue: 164000 }
			],
			rowCount: 2,
			totalRowCount: 2,
			truncated: false
		})
	})

	it('resolves a released indicator code to its governed Cube measure', async () => {
		const semanticModelService = createSemanticModelService()
		semanticModelService.queryUose.mockResolvedValue({
			code: 'UOSE-MDX-5001',
			message: 'syntax error at or near "["'
		})
		semanticModelService.findOne.mockResolvedValue({
			id: 'model-1',
			indicators: [
				{
					code: 'SALES_AMOUNT_KPI',
					name: 'Sales Amount KPI',
					status: 'RELEASED',
					entity: 'Sales',
					options: {
						measure: 'Sales Amount'
					}
				}
			],
			draft: {
				schema: {
					cubes: [
						{
							name: 'Sales',
							table: 'demo.adv_sales',
							measures: [
								{
									name: 'Sales Amount',
									column: 'sales_amount',
									aggregator: 'sum'
								}
							]
						}
					],
					dimensions: [],
					virtualCubes: []
				}
			}
		})
		semanticModelService.query.mockResolvedValue({
			data: [{ SALES_AMOUNT_KPI: 442083810.72 }]
		})
		const service = new DataXQueryAnalysisService(semanticModelService as unknown as SemanticModelService)

		const result = await service.execute(
			{
				modelId: 'model-1',
				cubeName: 'Sales',
				statement: 'SELECT [Measures].[SALES_AMOUNT_KPI] ON COLUMNS FROM [Sales]',
				openWorkbench: false
			},
			{
				userId: 'user-1'
			}
		)

		expect(semanticModelService.findOne).toHaveBeenCalledWith(
			'model-1',
			expect.objectContaining({
				relations: expect.arrayContaining(['indicators'])
			})
		)
		expect(semanticModelService.query).toHaveBeenCalledWith(
			'model-1',
			{
				statement: 'SELECT SUM("sales_amount") AS "SALES_AMOUNT_KPI" FROM "demo"."adv_sales" LIMIT 200'
			},
			{}
		)
		expect(result).toMatchObject({
			columns: [{ name: 'SALES_AMOUNT_KPI', type: 'number' }],
			rows: [{ SALES_AMOUNT_KPI: 442083810.72 }],
			rowCount: 1,
			totalRowCount: 1
		})
	})
})

function createSemanticModelService() {
	return {
		findMy: jest.fn(),
		findOne: jest.fn(),
		queryUose: jest.fn(),
		query: jest.fn()
	}
}
